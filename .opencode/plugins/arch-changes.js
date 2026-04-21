/**
 * ApexYard OpenCode Plugin: Architecture Change AgDR Requirement
 * 
 * PreToolUse hook on `git commit`: requires an AgDR when architecture files change.
 * Based on .claude/hooks/require-agdr-for-arch-changes.sh
 */

import { isCommit, getRepoRoot, ARCH_PATTERNS, fileExists, readFile } from './lib.js';

const fs = require('fs');

const DEFAULT_ARCH_PATTERNS = [
  /\.tf$/,                           // Terraform
  /\.tfvars$/,                       // Terraform variables
  /(^|\/)docker-compose.*\.ya?ml$/,   // Docker Compose
  /(^|\/)Dockerfile$/,                // Dockerfiles
  /^\.github\/workflows\//             // GitHub Actions
];

/**
 * Check if any staged file matches architecture patterns
 */
const hasArchChanges = async (patterns) => {
  try {
    // Get list of staged files
    const result = require('child_process').execSync('git diff --cached --name-only', { 
      encoding: 'utf8', 
      stdio: 'pipe' 
    });
    const files = result.trim().split('\n').filter(f => f);
    
    for (const file of files) {
      for (const pattern of patterns) {
        if (pattern.test(file)) return true;
      }
    }
    return false;
  } catch (e) {
    return false;
  }
};

/**
 * Check if staged files include an AgDR
 */
const hasAgdrInStaged = () => {
  try {
    const result = require('child_process').execSync('git diff --cached --name-only', { 
      encoding: 'utf8', 
      stdio: 'pipe' 
    });
    const files = result.trim().split('\n').filter(f => f);
    return files.some(f => f.includes('docs/agdr/AgDR-') && f.includes('migration'));
  } catch (e) {
    return false;
  }
};

export const ArchChangesPlugin = async ({ project, client, $, directory, worktree }) => {
  return {
    "tool.execute.before": async (input, output) => {
      const command = input.args?.command || '';
      if (!isCommit(command)) return;
      
      // Load custom patterns from project-config.json
      const repoRoot = getRepoRoot();
      const configPath = `${repoRoot}/.claude/project-config.json`;
      let patterns = DEFAULT_ARCH_PATTERNS;
      
      if (fileExists(configPath)) {
        try {
          const config = JSON.parse(readFile(configPath) || '{}');
          if (config.architecture_paths) {
            patterns = config.architecture_paths.map(p => new RegExp(p));
          }
        } catch (e) {}
      }
      
      // Check for architecture changes
      const hasArch = await hasArchChanges(patterns);
      if (!hasArch) return;
      
      // Check if an AgDR is staged or referenced
      const hasAgdr = hasAgdrInStaged();
      if (!hasAgdr) {
        throw new Error(`BLOCKED: Architecture files changed but no AgDR staged or referenced.

ApexYard requires an Agent Decision Record (AgDR) for architecture changes.
Create docs/agdr/AgDR-XXXX-architecture-description.md and stage it with the commit,
OR reference an existing AgDR in the commit message.


Architecture path patterns detected: ${patterns.map(p => p.toString()).join(', ')}`);
      }
    }
  };
};

export default ArchChangesPlugin;