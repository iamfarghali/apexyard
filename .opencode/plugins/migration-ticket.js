/**
 * ApexYard OpenCode Plugin: Migration Ticket Enforcement
 * 
 * PreToolUse hook on Write/Edit/MultiEdit: when the target path looks like a
 * database migration file, enforce the migration-ticket-first rule.
 * Based on .claude/hooks/require-migration-ticket.sh
 * 
 * Three gates:
 *   G1. Active ticket marker exists
 *   G2. Issue is OPEN and carries the migration label
 *   G3. Issue body references a migration AgDR
 */

import { fileExists, readFile, findOpsRoot, getRepoRoot, runGh } from './lib.js';

const fs = require('fs');
const path = require('path');

const DEFAULT_MIGRATION_PATTERNS = [
  /\/migrations\/\.+\.sql$/,           // SQL migrations
  /\/migrate-\.(ts|js|py|sql)$/,       // migrate-*.{ts,js,py,sql}
  /\/prisma\/schema\.prisma$/,           // Prisma schema
  /\/prisma\/migrations\//,            // Prisma migrations
  /\/src\/migrations\/\.(ts|js)$/,     // TypeORM
  /\/alembic\/versions\/\.py$/,         // Alembic
  /\/db\/migrate\/\.rb$/,              // Rails
  /\/migrations\/$/                     // Generic migrations dir
];

/**
 * Check if a path matches migration patterns
 */
const isMigrationPath = (filePath, customPatterns = null) => {
  const patterns = customPatterns || DEFAULT_MIGRATION_PATTERNS;
  return patterns.some(p => p.test(filePath));
};

/**
 * Load project config if exists
 */
const loadProjectConfig = (opsRoot) => {
  if (!opsRoot) return {};
  const configPath = path.join(opsRoot, '.claude/project-config.json');
  if (!fileExists(configPath)) return {};
  try {
    const content = readFile(configPath);
    return content ? JSON.parse(content) : {};
  } catch (e) {
    return {};
  }
};

/**
 * Get ticket marker info
 */
const getTicketMarker = async (filePath, opsRoot) => {
  const markerHome = opsRoot || '.';
  
  // Per-project resolution
  let project = null;
  if (opsRoot && filePath.includes('/workspace/')) {
    const match = filePath.match(/\/workspace\/([^/]+)/);
    if (match) project = match[1];
  }
  
  let markerPath = null;
  if (project) {
    const perProjectMarker = `${markerHome}/.claude/session/tickets/${project}`;
    if (fileExists(perProjectMarker)) {
      markerPath = perProjectMarker;
    }
  }
  
  // Fallback
  if (!markerPath) {
    const fallback = `${markerHome}/.claude/session/current-ticket`;
    if (fileExists(fallback)) {
      markerPath = fallback;
    }
  }
  
  if (!markerPath) return null;
  
  const content = readFile(markerPath);
  if (!content) return null;
  
  const lines = content.split('\n');
  const marker = {};
  for (const line of lines) {
    const [key, ...vals] = line.split('=');
    if (key) marker[key] = vals.join('=');
  }
  
  return marker;
};

export const MigrationTicketPlugin = async ({ project, client, $, directory, worktree }) => {
  return {
    "tool.execute.before": async (input, output) => {
      const blockedTools = ['Edit', 'Write', 'MultiEdit'];
      if (!blockedTools.includes(input.tool)) return;
      
      const filePath = input.args?.file_path || input.args?.path;
      if (!filePath) return;
      
      // Exempt meta/docs/example files
      if (filePath.includes('/.claude/') || 
          filePath.includes('/docs/') ||
          filePath.endsWith('.md') ||
          filePath.endsWith('.example')) {
        return;
      }
      
      // Find ops root
      const repoRoot = getRepoRoot();
      const opsRoot = await findOpsRoot(repoRoot || directory);
      
      // Load project config
      const config = loadProjectConfig(opsRoot);
      const migrationLabel = config.migration_label || 'migration';
      const customPaths = config.migration_paths || null;
      
      // Check if migration path
      if (!isMigrationPath(filePath, customPaths)) {
        return; // Not a migration, let other hooks handle
      }
      
      // Gate 1: Active ticket marker
      const marker = await getTicketMarker(filePath, opsRoot);
      if (!marker) {
        throw new Error(`BLOCKED: No active ticket set — and this file looks like a database migration.

Migrations need a dedicated labelled ticket + AgDR, not just any ticket.
Run /migration to create both in one guided flow:

  /migration

Then /start-ticket <owner/repo>#<number> to activate the new ticket for
this session, and retry the edit.

Path matched migration pattern: ${filePath}`);
      }
      
      // Gate 2: Issue is OPEN and has migration label
      const { repo, number } = marker;
      if (!repo || !number) {
        throw new Error(`BLOCKED: Active ticket marker is missing 'repo=' or 'number='.

Re-run /start-ticket to rewrite the marker cleanly.`);
      }
      
      let issueJson;
      try {
        issueJson = runGh(`issue view ${number} --repo ${repo} --json state,labels,body`);
      } catch (e) {
        issueJson = null;
      }
      
      if (!issueJson) {
        throw new Error(`BLOCKED: Could not fetch ${repo}#${number} from GitHub.

Network/auth problem? Or the issue doesn't exist?
Migration files can't be edited without a verifiable migration ticket.`);
      }
      
      let issue;
      try {
        issue = JSON.parse(issueJson);
      } catch (e) {
        throw new Error(`BLOCKED: Could not parse issue JSON from GitHub.`);
      }
      
      if (issue.state !== 'OPEN') {
        throw new Error(`BLOCKED: Active ticket ${repo}#${number} is ${issue.state}, not OPEN.

Migration files require an OPEN labelled ticket.`);
      }
      
      const hasLabel = issue.labels?.some(l => l.name === migrationLabel);
      if (!hasLabel) {
        throw new Error(`BLOCKED: Active ticket ${repo}#${number} does not have the \`${migrationLabel}\` label.

Migrations need a dedicated labelled ticket.
Two options:
  1. Add the label: gh issue edit ${number} --repo ${repo} --add-label "${migrationLabel}"
  2. Create fresh: /migration
Then /start-ticket the new ticket and retry.`);
      }
      
      // Gate 3: Body references a migration AgDR
      const agdrRegex = /docs\/agdr\/AgDR-[0-9]+-[^/]*migration[^/]*\.md/;
      if (!agdrRegex.test(issue.body || '')) {
        throw new Error(`BLOCKED: Active ticket ${repo}#${number} has the \`${migrationLabel}\` label 
but its body does not reference a migration AgDR (docs/agdr/AgDR-*-migration*.md).

A migration-class change needs a paired Agent Decision Record.
Create one with /migration, or link an existing AgDR in the ticket body.`);
      }
    }
  };
};

export default MigrationTicketPlugin;