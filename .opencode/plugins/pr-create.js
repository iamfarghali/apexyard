/**
 * ApexYard OpenCode Plugin: PR Create Validation
 * 
 * PreToolUse hook on `gh pr create`: validates PR title format,
 * branch name has ticket ID, and the referenced ticket exists.
 * Based on .claude/hooks/validate-pr-create.sh
 */

import { isPrCreate, getRepoRoot, getCurrentBranch, runGh, readFile, fileExists } from './lib.js';

const path = require('path');

const PR_TITLE_REGEX = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)\(([A-Z]{2,10}-[0-9]+|#[0-9]+)\)!?:/;

export const PrCreatePlugin = async ({ project, client, $, directory, worktree }) => {
  return {
    "tool.execute.before": async (input, output) => {
      const command = input.args?.command || '';
      if (!isPrCreate(command)) return;
      
      const errors = [];
      const repoRoot = getRepoRoot();
      
      // Extract --title
      let title = '';
      const titleMatch = command.match(/--title["']?\s*["']?([^"']+)["']?/);
      if (titleMatch) title = titleMatch[1].trim();
      
      // Validate PR title format
      if (title && !PR_TITLE_REGEX.test(title)) {
        errors.push(`PR title '${title}' doesn't match format: type(TICKET-ID): description`);
      }
      
      // Extract ticket reference from title and verify it exists
      if (title) {
        const ticketMatch = title.match(/\(([^)]+)\)/);
        if (ticketMatch) {
          const ticketRef = ticketMatch[1];
          const ticketNum = ticketRef.match(/[0-9]+$/)?.[0];
          
          if (ticketNum) {
            // Resolve tracker repo
            let trackerRepo = null;
            
            // Try --repo flag from command
            const repoMatch = command.match(/--repo["']?\s*["']?([^"']+)["']?/);
            if (repoMatch) trackerRepo = repoMatch[1];
            
            // Try project-config.json
            if (!trackerRepo) {
              const configPath = path.join(repoRoot || '.', '.claude/project-config.json');
              if (fileExists(configPath)) {
                try {
                  const config = JSON.parse(readFile(configPath) || '{}');
                  trackerRepo = config.tracker_repo || null;
                } catch (e) {}
              }
            }
            
            // Fallback to origin remote
            if (!trackerRepo) {
              try {
                const originUrl = runGh('remote get-url origin');
                const urlMatch = originUrl?.match(/[:/]([^/]+\/[^/]+)(?:\.git)?$/);
                if (urlMatch) trackerRepo = urlMatch[1];
              } catch (e) {}
            }
            
            if (trackerRepo && ticketNum) {
              // Verify issue exists
              let issueJson;
              try {
                issueJson = runGh(`issue view ${ticketNum} --repo ${trackerRepo} --json number,state`);
              } catch (e) {
                issueJson = null;
              }
              
              if (!issueJson) {
                errors.push(`PR title references ${ticketRef} but issue #${ticketNum} does not exist in ${trackerRepo}.`);
              } else {
                try {
                  const issue = JSON.parse(issueJson);
                  if (issue.state === 'CLOSED') {
                    errors.push(`PR title references ${ticketRef} but issue #${ticketNum} in ${trackerRepo} is CLOSED.`);
                  }
                } catch (e) {}
              }
            }
          }
        }
      }
      
      // Check branch has ticket ID
      const branch = getCurrentBranch();
      if (branch && branch !== 'main' && branch !== 'master') {
        if (!/[A-Z]{2,10}-[0-9]+|GH-[0-9]+|#[0-9]+/.test(branch)) {
          errors.push(`Branch '${branch}' missing ticket ID`);
        }
      }
      
      // Block if any errors
      if (errors.length > 0) {
        throw new Error(`PR VALIDATION BLOCKED:\n${errors.join('\n')}\n\nFix the issues above before creating the PR.\nSee .claude/rules/git-conventions.md and .claude/rules/pr-quality.md.`);
      }
    }
  };
};

export default PrCreatePlugin;