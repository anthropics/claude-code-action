#!/usr/bin/env node

const https = require('https');
const path = require('path');

// Load QA credentials to send as PeerQA
console.log('🔧 Loading test configuration...');
require('dotenv').config({ path: path.join(__dirname, '.env.qa') });
const QA_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const TARGET_BOT_USERNAME = process.env.TARGET_BOT_USERNAME;

// Validate required environment variables
if (!TARGET_BOT_USERNAME) {
  console.error('❌ TARGET_BOT_USERNAME environment variable is required');
  console.error('Please set TARGET_BOT_USERNAME in your .env.qa file');
  process.exit(1);
}

if (!QA_BOT_TOKEN) {
  console.error('❌ SLACK_BOT_TOKEN environment variable is required');
  console.error('Please set SLACK_BOT_TOKEN in your .env.qa file');
  process.exit(1);
}

async function makeSlackRequest(method, body) {
  return new Promise((resolve, reject) => {
    const needsUrlEncoding = ['conversations.info', 'conversations.history'].includes(method);
    const postData = needsUrlEncoding 
      ? new URLSearchParams(body).toString()
      : JSON.stringify(body);
    
    const options = {
      hostname: 'slack.com',
      port: 443,
      path: `/api/${method}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${QA_BOT_TOKEN}`,
        'Content-Type': needsUrlEncoding ? 'application/x-www-form-urlencoded' : 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.ok) {
            resolve(result);
          } else {
            reject(new Error(`Slack API error: ${result.error}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function waitForBotResponse(channel, afterTimestamp, timeout = 30000) {
  console.log('⏳ Waiting for bot response...');
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const history = await makeSlackRequest('conversations.history', {
        channel: channel,
        oldest: afterTimestamp,
        limit: 10
      });
      
      // Look for bot messages (any message with bot_id)
      const botMessages = history.messages.filter(msg => msg.bot_id);
      
      if (botMessages.length > 0) {
        return botMessages;
      }
    } catch (error) {
      // Ignore rate limit errors and continue waiting
    }
    
    // Wait 2 seconds before checking again
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  return null;
}

async function checkForAnyReaction(channel, timestamp, timeout = 10000) {
  console.log('⏳ Checking for any reaction (cog=processing, checkmark=success)...');
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const result = await makeSlackRequest('reactions.get', {
        channel: channel,
        timestamp: timestamp
      });
      
      if (result.message && result.message.reactions) {
        const cogReaction = result.message.reactions.find(r => r.name === 'gear');
        const checkmarkReaction = result.message.reactions.find(r => r.name === 'white_check_mark');
        
        if (checkmarkReaction) {
          return 'success';
        } else if (cogReaction) {
          return 'processing';
        }
      }
    } catch (error) {
      // Message might not exist yet or no reactions
    }
    
    // Wait 1 second before checking again for initial reaction
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return 'none';
}

async function waitForSuccessReaction(channel, timestamp, timeout = 30000) {
  console.log('⏳ Waiting for success reaction (white_check_mark)...');
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const result = await makeSlackRequest('reactions.get', {
        channel: channel,
        timestamp: timestamp
      });
      
      if (result.message && result.message.reactions) {
        const checkmarkReaction = result.message.reactions.find(r => r.name === 'white_check_mark');
        if (checkmarkReaction) {
          return true;
        }
      }
    } catch (error) {
      // Message might not exist yet or no reactions
    }
    
    // Wait 2 seconds before checking again
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  return false;
}

async function evaluateTestResult(channel, messageTs, timeout, testType = 'Test') {
  // First, check for any reaction within 10 seconds
  const initialReaction = await checkForAnyReaction(channel, messageTs, 10000);
  
  if (initialReaction === 'none') {
    console.log('❌ No reaction from bot within 10 seconds - bot failed to acknowledge the message');
    console.log('\nTroubleshooting steps:');
    console.log('1. Check dispatcher logs for incoming events: kubectl logs -n peerbot -l app.kubernetes.io/component=dispatcher --tail=50');
    console.log('2. Verify dispatcher is receiving Slack events: kubectl logs -n peerbot -l app.kubernetes.io/component=dispatcher --tail=50 | grep "mention"');
    console.log('3. Check if message is queued: kubectl logs -n peerbot -l app.kubernetes.io/component=dispatcher --tail=50 | grep "Enqueuing"');
    console.log('4. Check orchestrator for scaling issues: kubectl logs -n peerbot -l app.kubernetes.io/component=orchestrator --tail=50');
    console.log('5. Verify worker pods exist: kubectl get pods -n peerbot | grep claude-worker');
    console.log('6. Check PostgreSQL connection: kubectl exec -it -n peerbot deployment/peerbot-dispatcher -- nc -zv postgres-service 5432');
    console.log('7. Restart all components if needed: kubectl rollout restart deployment -n peerbot');
    process.exit(1);
  } else if (initialReaction === 'success') {
    console.log('✅ Bot immediately processed message (checkmark reaction)');
  } else if (initialReaction === 'processing') {
    console.log('⚙️ Bot started processing (cog reaction detected)');
    
    // Wait for success reaction
    const hasSuccess = await waitForSuccessReaction(channel, messageTs, timeout);
    
    if (!hasSuccess) {
      console.log('❌ Bot started processing but never completed (no checkmark reaction)');
      console.log('\nTroubleshooting steps:');
      console.log('1. Check worker pod status: kubectl get pods -n peerbot | grep claude-worker');
      console.log('2. Check worker logs for errors: kubectl logs -n peerbot -l app.kubernetes.io/component=claude-worker --tail=100');
      console.log('3. Check if worker has sufficient resources: kubectl describe pod -n peerbot -l app.kubernetes.io/component=claude-worker');
      console.log('4. Check queue for stuck messages: kubectl logs -n peerbot -l app.kubernetes.io/component=dispatcher --tail=50 | grep "queue"');
      console.log('5. Restart worker pods if necessary: kubectl rollout restart deployment/peerbot-claude-worker -n peerbot');
      console.log('6. Check orchestrator logs: kubectl logs -n peerbot -l app.kubernetes.io/component=orchestrator --tail=50');
      console.log('7. Verify PostgreSQL queue is accessible: kubectl exec -it -n peerbot deployment/peerbot-dispatcher -- nc -zv postgres-service 5432');
      process.exit(1);
    } else {
      console.log('✅ Bot completed processing (checkmark reaction added)');
    }
  }
  
  // At this point, we know the bot processed the message (has checkmark)
  // Wait for response message
  const response = await waitForBotResponse(channel, messageTs, timeout);
  
  // Check for "Starting environment setup" stuck state
  const isStuckInSetup = response && response.length > 0 && 
    response[0].text && response[0].text.includes('Starting environment setup') &&
    response.length === 1 && !response[0].text.includes('✅');
  
  if (isStuckInSetup) {
    console.log('❌ Bot is stuck in "Starting environment setup" message');
    console.log('\n⚠️ Bot appears to be stuck during initialization');
    console.log('\nTroubleshooting steps:');
    console.log('1. Check worker pod status: kubectl get pods -n peerbot | grep claude-worker');
    console.log('2. Check worker logs for errors: kubectl logs -n peerbot -l app.kubernetes.io/component=claude-worker --tail=100');
    console.log('3. Check if worker has sufficient resources: kubectl describe pod -n peerbot -l app.kubernetes.io/component=claude-worker');
    console.log('4. Check queue for stuck messages: kubectl logs -n peerbot -l app.kubernetes.io/component=dispatcher --tail=50 | grep "queue"');
    console.log('5. Restart worker pods if necessary: kubectl rollout restart deployment/peerbot-claude-worker -n peerbot');
    console.log('6. Check orchestrator logs: kubectl logs -n peerbot -l app.kubernetes.io/component=orchestrator --tail=50');
    console.log('7. Verify PostgreSQL queue is accessible: kubectl exec -it -n peerbot deployment/peerbot-dispatcher -- nc -zv postgres-service 5432');
    process.exit(1);
  }
  
  if (response && response.length > 0) {
    console.log(`✅ Bot responded with message!`);
    console.log(`   Response: "${response[0].text?.substring(0, 200)}..."`);
    
    // Check if response has blocks (for blockkit)
    if (response[0].blocks && response[0].blocks.length > 0) {
      console.log(`   Blocks: ${response[0].blocks.length} blocks found`);
      const actionBlocks = response[0].blocks.filter(b => b.type === 'actions');
      if (actionBlocks.length > 0) {
        console.log(`   ✨ Found ${actionBlocks.length} action block(s) with buttons!`);
      }
    }
    
    console.log(`\n🎉 ${testType} PASSED!`);
    return true;
  } else {
    console.log('⚠️ Bot processed message but no response was sent');
    console.log(`\n⚠️ ${testType} PARTIALLY PASSED - Consider this a failure for automation purposes`);
    process.exit(1);
  }
}

async function runTest(messages, timeout = 30000) {
  const isSingleMessage = messages.length === 1;
  const testType = isSingleMessage ? 'Test' : 'Multi-Message Test';
  
  console.log(`🧪 Peerbot ${testType}`);
  console.log('📤 Sending as: PeerQA');
  console.log(`🎯 Target: @${TARGET_BOT_USERNAME}`);
  if (!isSingleMessage) {
    console.log(`📝 Messages: ${messages.length}`);
  }
  console.log('');
  
  const targetChannel = 'C0952LTF7DG'; // #peerbot-qa
  let firstMessageTs = null;
  
  try {
    for (let i = 0; i < messages.length; i++) {
      const prompt = messages[i];
      const isFirstMessage = i === 0;
      const message = `@${TARGET_BOT_USERNAME} ${prompt}`;
      
      if (messages.length > 1) {
        console.log(`📨 Sending message ${i + 1}/${messages.length}${isFirstMessage ? ' (initial)' : ' (thread)'}...`);
      } else {
        console.log('📨 Sending test message...');
      }
      
      const requestBody = {
        channel: targetChannel,
        text: message
      };
      
      // If not the first message, send in thread
      if (!isFirstMessage && firstMessageTs) {
        requestBody.thread_ts = firstMessageTs;
      }
      
      const msg = await makeSlackRequest('chat.postMessage', requestBody);
      
      if (isFirstMessage) {
        firstMessageTs = msg.ts;
      }
      
      console.log(`✅ Sent: "${message}"`);
      console.log(`   Timestamp: ${msg.ts}`);
      if (messages.length > 1) {
        console.log(`   ${isFirstMessage ? 'Thread started' : 'Added to thread'}`);
      }
      console.log('');
      
      // Wait a bit between messages
      if (i < messages.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Wait a bit for the bot to start processing
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Evaluate test result
    const success = await evaluateTestResult(targetChannel, firstMessageTs, timeout, testType);
    
    console.log('\n🔗 Channel: https://peerbotcommunity.slack.com/archives/C0952LTF7DG');
    
    // Exit with proper code
    process.exit(success ? 0 : 1);
    
  } catch (error) {
    console.error(`❌ ${testType} failed:`, error.message);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
let messages = [];
let timeout = 30000; // default 30 seconds

// Parse --timeout option
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--timeout' && args[i + 1]) {
    timeout = parseInt(args[i + 1]) * 1000; // convert seconds to milliseconds
    args.splice(i, 2); // remove --timeout and its value
    break;
  }
}

// Remaining args are messages
messages = args.filter(arg => arg.trim().length > 0);

if (messages.length > 0) {
  runTest(messages, timeout);
} else {
  // Run default tests
  runTest(['Create me a new project for my landing page of a Pet Store? It\' is a fictionary app so be creating don\'t ask me. Project name is "Pet Store {timestamp}"'], timeout);
  runTest(['Create a button to add a new pet to the pet store'], timeout);
  runTest(["Create 5 tasks which will each return a random number and then you will sum all them."], timeout);
}