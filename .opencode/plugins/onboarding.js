/**
 * ApexYard OpenCode Plugin: Onboarding Check
 * 
 * SessionStart event: injects a reminder to run /onboard if not yet onboarded.
 * Based on .claude/hooks/onboarding-check.sh
 */

import { fileExists, findOpsRoot, getRepoRoot } from './lib.js';

const path = require('path');

export const OnboardingPlugin = async ({ project, client, $, directory, worktree }) => {
  return {
    "event: session.created": async ({ event }) => {
      // Find the ops root (contains onboarding.yaml and apexyard.projects.yaml)
      const repoRoot = getRepoRoot();
      const opsRoot = await findOpsRoot(repoRoot || directory);
      
      if (!opsRoot) return; // Not in an ApexYard fork
      
      const onboardedMarker = path.join(opsRoot, '.claude/session/onboarded');
      
      if (!fileExists(onboardedMarker)) {
        // Not yet onboarded - inject reminder
        if (client && client.session) {
          await client.session.prompt({
            body: {
              role: 'user',
              content: `ONBOARDING REQUIRED

This appears to be your first session in this ApexYard fork. Before proceeding with work:

  1. Run /onboard to configure this project
  2. Answer the discovery questions about your stack, tracker, and team

The /onboard skill will set up .claude/session/onboarded and .claude/project-config.json
to configure the project-specific rules.

See docs/multi-project.md for full setup instructions.`
            }
          });
        }
      }
    }
  };
};

export default OnboardingPlugin;