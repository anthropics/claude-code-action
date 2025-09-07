---
allowed-tools: Bash(gh pr comment:*),Bash(gh pr diff:*),Bash(gh pr view:*)
description: Review a pull request
---

Perform a comprehensive code review with the following focus areas:

1. **Code Quality**

   - Clean code principles and best practices
   - Proper error handling and edge cases
   - Code readability and maintainability

2. **Security**

   - Check for potential security vulnerabilities
   - Validate input sanitization
   - Review authentication/authorization logic

3. **Performance**

   - Identify potential performance bottlenecks
   - Review network queries for efficiency
   - Check for memory leaks or resource issues

4. **Testing**

   - Verify adequate test coverage
   - Review test quality and edge cases
   - Check for missing test scenarios

5. **Documentation**
   - Ensure code is properly documented
   - Verify README updates for new features
   - Check API documentation accuracy

Use a subagent for each area. Instruct each to only provide noteworthy feedback. Once they finish, review the feedback and post only the feedback that you also deem noteworthy.

Provide feedback using inline comments for specific issues.
Use top-level comments for general observations or praise.
Keep feedback concise.

---
