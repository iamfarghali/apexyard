/**
 * ApexYard OpenCode Plugin: Pre-Push Gate Reminder
 * 
 * PreToolUse hook on `git push`: reminds to run CI checks locally.
 * Based on .claude/hooks/pre-push-gate.sh
 * 
 * This is a warning only - it doesn't block the push.
 */

import { isPush, getRepoRoot } from './lib.js';

export const PrePushPlugin = async ({ project, client, $, directory, worktree }) => {
  return {
    "tool.execute.before": async (input, output) => {
      const command = input.args?.command || '';
      if (!isPush(command)) return;
      
      // This is a warning hook - use the client to inject a reminder
      if (client && client.session) {
        try {
          await client.session.prompt({
            body: {
              role: 'user',
              content: `PRE-PUSH REMINDER: Ensure these passed locally before pushing:

  [ ] Lint                  (e.g. npm run lint)
  [ ] Type check            (e.g. npm run typecheck)
  [ ] Tests                 (e.g. npm run test)
  [ ] Build                 (e.g. npm run build)
  [ ] Framework validation  (e.g. sam validate, terraform validate)

This is a reminder - push was allowed.`
            }
          });
        } catch (e) {
          // API failure shouldn't block push
          console.error('Warning: Could not show pre-push reminder:', e.message);
        }
      }
    }
  };
};

export default PrePushPlugin;