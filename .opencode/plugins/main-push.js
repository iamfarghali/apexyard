/**
 * ApexYard OpenCode Plugin: Block Main Push
 * 
 * PreToolUse hook on `git push`: blocks pushing directly to main/master.
 * Based on .claude/hooks/block-main-push.sh
 */

import { isPush, getCurrentBranch } from './lib.js';

export const MainPushPlugin = async ({ project, client, $, directory, worktree }) => {
  return {
    "tool.execute.before": async (input, output) => {
      const command = input.args?.command || '';
      if (!isPush(command)) return;
      
      // Check if pushing to main or master
      const branch = getCurrentBranch();
      
      if (branch === 'main' || branch === 'master') {
        throw new Error(`BLOCKED: Direct push to ${branch} is not allowed.

All changes must go through a PR. Create a branch, commit your changes,
push the branch, then create a PR to merge.`);
      }
      
      // Also check if --force is being used on main
      if (command.includes('--force') || command.includes('-f')) {
        // Check destination
        if (command.includes('main') || command.includes('master')) {
          throw new Error(`BLOCKED: Force push to main/master is not allowed.

This would overwrite history and break the team workflow.`);
        }
      }
    }
  };
};

export default MainPushPlugin;