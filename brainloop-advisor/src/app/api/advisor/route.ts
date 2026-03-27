import { NextRequest, NextResponse } from "next/server";

const responseBank: Record<string, string[]> = {
  "life-coach": [
    "You have more strength within you than you realize. Every challenge you face is building the resilience that will carry you through even greater obstacles ahead. Start with one small step today.",
    "Remember, progress is not about perfection. It is about showing up consistently, even when motivation is low. The discipline you build today becomes the foundation of your future self.",
    "Your potential is not defined by your past mistakes or current circumstances. It is defined by the choices you make right now, in this moment. What will you choose?",
    "Fear is just excitement without the breath. When you feel that resistance, lean into it. That is exactly where your growth edge lives, and it is calling you forward.",
    "The most powerful thing you can do is take responsibility for your own happiness. No one else can give that to you. It is a daily practice, not a destination.",
    "I want you to celebrate your wins today, no matter how small they seem. Did you get out of bed? That counts. Did you reach out for help? That is incredible courage.",
    "The gap between where you are and where you want to be is bridged by action, not by overthinking. What is one thing you can do in the next ten minutes to move forward?",
    "You are not behind in life. There is no universal timeline you need to follow. Your journey is uniquely yours, and comparison is the thief of your joy and momentum.",
    "When you feel overwhelmed, break everything down into the smallest possible action. You do not have to solve everything at once. Just focus on the next right thing.",
    "Boundaries are not selfish. They are essential. Protecting your energy and time is one of the most loving things you can do for yourself and the people around you.",
    "Your self-talk matters more than you think. Would you speak to a friend the way you speak to yourself? Start treating yourself with the same compassion you give others.",
    "Failure is not the opposite of success. It is a stepping stone toward it. Every successful person you admire has a collection of failures that taught them what they needed to know.",
    "Gratitude is not just a nice idea. It is a practice that rewires your brain for positivity. Name three things you are thankful for right now, and feel the shift.",
    "You are allowed to outgrow people, places, and habits that no longer serve you. Growth sometimes means letting go, and that takes incredible bravery.",
    "Energy flows where attention goes. Focus on what you want to create, not what you want to avoid. Your mindset is the most powerful tool you possess.",
    "Rest is not laziness. It is recovery. You cannot pour from an empty cup, and taking time to recharge is how you sustain your drive for the long run.",
  ],
  "career-strategist": [
    "In today's market, your personal brand is just as important as your resume. Consider what unique value you bring to the table and make sure your online presence reflects that clearly.",
    "Strategic career moves are about positioning, not just performance. Think about where your industry is heading in the next three to five years and align your skills accordingly.",
    "Networking is not about collecting contacts. It is about cultivating meaningful relationships. Focus on providing value first, and opportunities will naturally follow your reputation.",
    "Before asking for a promotion, document your impact with specific metrics and results. Numbers speak louder than effort, and decision-makers respond to quantifiable contributions.",
    "The best time to negotiate your compensation is before you accept an offer, not after. Research market rates thoroughly and present your case with confidence and data.",
    "Skill stacking is your competitive advantage. Combine two or three complementary skills that are individually common but rarely found together. That intersection is where your unique value lies.",
    "Do not wait for the perfect opportunity. Create it. Propose a project that solves a real problem in your organization and volunteer to lead it. Initiative is noticed.",
    "Every career pivot starts with transferable skills. Identify what you excel at that transcends any single industry, and you will find more doors open than you expected.",
    "Mentorship accelerates growth faster than almost anything else. Find someone two to three levels ahead of where you want to be and ask thoughtful, specific questions.",
    "Your LinkedIn profile should read like a value proposition, not a job history. Lead with outcomes and impact, not responsibilities. Show what you achieved, not just what you did.",
    "Remote work has changed the game. Build systems for visibility when you are not physically present. Regular updates, documented wins, and proactive communication keep you on the radar.",
    "The interview is a two-way street. Prepare questions that reveal company culture, growth trajectories, and leadership philosophy. The right fit matters as much as the right title.",
    "Side projects and portfolio work demonstrate initiative better than any bullet point on a resume. Build something tangible that showcases your problem-solving ability.",
    "Career plateaus are normal but not permanent. They usually signal it is time to either deepen your expertise or broaden your scope. Which direction feels more energizing to you?",
    "When facing a difficult workplace situation, document everything professionally and focus on solutions rather than blame. Your ability to navigate conflict gracefully is a leadership quality.",
    "Continuous learning is non-negotiable in a rapidly evolving economy. Dedicate at least five hours per week to developing new skills or deepening existing ones.",
  ],
  "relationship-guide": [
    "Healthy relationships are built on a foundation of trust, which is earned through consistent actions over time. Small gestures of reliability matter far more than grand declarations.",
    "Communication is not just about expressing your needs. It is equally about creating space for the other person to express theirs. Active listening is the cornerstone of connection.",
    "Conflict is not the enemy of a relationship. It is how you handle conflict that determines the health of your bond. Fight the problem together, not each other.",
    "Attachment styles shape how we love and what triggers us. Understanding your own patterns is the first step toward building healthier, more secure connections with others.",
    "Love languages are not just for romantic relationships. Understanding how your friends, family, and colleagues feel valued can transform every relationship in your life.",
    "Setting boundaries is an act of love, not rejection. When you clearly communicate your limits, you are actually inviting deeper, more authentic connection.",
    "Vulnerability is the birthplace of intimacy. Sharing your authentic self, fears and all, creates space for genuine closeness that surface-level interactions can never achieve.",
    "If you find yourself in a pattern of attracting the same type of unhealthy relationship, the common factor is the energy you are putting out. Self-reflection is where change begins.",
    "Forgiveness is not about condoning behavior. It is about freeing yourself from the weight of resentment. You deserve that peace, regardless of what the other person does.",
    "The strongest relationships have a ratio of about five positive interactions for every negative one. Small moments of kindness, appreciation, and humor create a resilient emotional bank account.",
    "Codependency often disguises itself as deep love, but true love allows both people to maintain their individual identity. Healthy relationships are between two whole people, not two halves.",
    "When someone shows you who they are, believe them the first time. Pay attention to patterns of behavior rather than promises of change that never materialize.",
    "Loneliness is not solved by being around more people. It is solved by being around the right people, those who see, hear, and appreciate who you truly are.",
    "Grief after a relationship ends is not weakness. It is the natural process of honoring what once was meaningful. Give yourself permission to feel without rushing to heal.",
    "The relationship you have with yourself sets the standard for every other relationship in your life. If you do not treat yourself well, you will accept poor treatment from others.",
    "Empathy without boundaries leads to burnout. You can hold space for someone else's pain without absorbing it. Compassion and self-preservation can coexist beautifully.",
  ],
  "creative-muse": [
    "Creativity is not a talent reserved for the chosen few. It is a muscle that strengthens with use. Show up to create something, anything, every single day and watch it grow.",
    "Your creative block is not a wall. It is a door that requires a different key. Try switching mediums, environments, or perspectives. Inspiration often hides in unexpected places.",
    "The first draft of anything is supposed to be imperfect. Give yourself permission to create badly. Editing and refinement come later. Right now, just let the ideas flow without judgment.",
    "Art does not have to be meaningful to be valuable. Sometimes the act of creation itself is the entire point. Joy in the process is the highest form of artistic success.",
    "Steal like an artist. Study the work that moves you, dissect what makes it powerful, and let those influences blend with your unique perspective into something entirely new.",
    "Constraints breed creativity. Instead of waiting for unlimited time or resources, embrace limitations. Some of the most innovative art was born from working within tight boundaries.",
    "Your creative voice is the intersection of everything you have ever experienced. No one else has your exact combination of influences, memories, and perspectives. That is your superpower.",
    "Collaboration multiplies creative potential exponentially. Find someone whose strengths complement your weaknesses and create something neither of you could have imagined alone.",
    "The world does not need another perfect piece. It needs your honest, raw, authentic expression. Imperfection is what makes art relatable and human.",
    "When inspiration strikes at inconvenient times, capture it immediately. A voice memo, a quick sketch, a scribbled note. These fragments are seeds for future masterpieces.",
    "Cross-pollinate your interests. The most innovative ideas come from connecting dots between seemingly unrelated fields. Read widely, explore freely, and let curiosity be your guide.",
    "Creative burnout is your mind telling you to refill the well. Go experience life, visit a museum, walk in nature, have a deep conversation. Input fuels output.",
    "Do not compare your behind-the-scenes to someone else's highlight reel. Every creator struggles. The ones who succeed are simply the ones who keep showing up despite the doubt.",
    "Color, rhythm, space, and contrast are universal languages. Whether you work with words, visuals, sound, or movement, these principles will elevate your craft to new heights.",
    "Start before you are ready. Waiting for the perfect moment, the perfect tool, or the perfect idea is the most effective way to ensure you never create anything at all.",
    "Your mistakes in the creative process are not failures. They are happy accidents waiting to be recognized. Some of the greatest artistic discoveries came from unplanned detours.",
  ],
  "stoic-philosopher": [
    "You cannot control what happens to you, but you can control how you respond. This distinction is the foundation of all inner peace and the root of genuine freedom.",
    "The obstacle in your path is not blocking your way. It is your way. Every difficulty you face is an opportunity to practice virtue, patience, and wisdom.",
    "Memento mori. Remember that your time is finite. This is not meant to frighten you, but to clarify what truly matters and dissolve the trivial concerns that consume your energy.",
    "External validation is a fragile foundation for self-worth. Build your sense of value on your own character, your principles, and the quality of your actions.",
    "Anger is a punishment we give ourselves for someone else's mistake. Before reacting, pause and ask whether this will matter in five years. If not, do not give it five minutes.",
    "The wise person does not seek pleasure or avoid pain. They seek to live in accordance with their values regardless of circumstances. This is the path to eudaimonia.",
    "Most of your suffering comes not from events themselves, but from your judgments about those events. Change the story you tell yourself and you change your experience of reality.",
    "Practice negative visualization. Contemplate what you could lose, and you will find deep gratitude for what you have. This is not pessimism. It is the most practical form of appreciation.",
    "You are disturbed not by things but by your opinions about things. Examine your beliefs with the rigor of a philosopher and the honesty of a scientist.",
    "The present moment is the only moment you truly possess. The past is memory, the future is imagination. To live fully is to be fully present in what is before you now.",
    "Do not waste your limited time and energy on things outside your sphere of influence. Focus on your own thoughts, actions, and character. This is where your power resides.",
    "Adversity reveals character more than prosperity ever could. It is easy to be virtuous when everything is comfortable. True character is forged in the fire of difficulty.",
    "The universe is change. Resistance to this fundamental truth is the source of most human suffering. Embrace impermanence and you embrace life itself in its fullness.",
    "Virtue is not a destination to arrive at but a practice to engage in daily. Each morning, recommit to being just, courageous, temperate, and wise in all your dealings.",
    "Compare yourself not to others but to who you were yesterday. The only meaningful competition is the one between your present self and your potential self.",
    "Silence and solitude are not luxuries. They are necessities for a well-examined life. In the noise of modern existence, carving out stillness is an act of philosophical courage.",
  ],
};

export async function POST(request: NextRequest) {
  try {
    const { persona, message } = await request.json();

    if (!persona || !message) {
      return NextResponse.json(
        { error: "Missing persona or message" },
        { status: 400 }
      );
    }

    const responses = responseBank[persona];
    if (!responses) {
      return NextResponse.json(
        { error: "Unknown persona" },
        { status: 400 }
      );
    }

    // Select a response based on message hash for variety
    let hash = 0;
    const fullStr = message + Date.now().toString();
    for (let i = 0; i < fullStr.length; i++) {
      const char = fullStr.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    const index = Math.abs(hash) % responses.length;
    const response = responses[index];

    // Simulate thinking delay
    await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 1200));

    return NextResponse.json({ response });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
