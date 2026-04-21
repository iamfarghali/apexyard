/**
 * ApexYard OpenCode Plugin: Upstream Drift Check
 * 
 * SessionStart event: checks if the local default branch is behind upstream.
 * Based on .claude/hooks/check-upstream-drift.sh
 * 
 * Caches the fetch result for 10 minutes to avoid repeated network calls.
 */

import { fileExists, findOpsRoot, getRepoRoot, runGh } from './lib.js';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

/**
 * Check if upstream has new commits (cached for 10 minutes)
 */
const checkUpstreamDrift = async (repoRoot, opsRoot) => {
  const cacheFile = path.join(opsRoot || repoRoot, '.claude/session/last-upstream-fetch');
  const now = Date.now();
  const tenMinutes = 10 * 60 * 1000;
  
  // Check cache
  if (fileExists(cacheFile)) {
    try {
      const cacheContent = fs.readFileSync(cacheFile, 'utf8').trim();
      const cachedTime = parseInt(cacheContent.split('\n')[0], 10);
      if (!isNaN(cachedTime) && (now - cachedTime) < tenMinutes) {
        return null; // Recently fetched, return cached result
      }
    } catch (e) {
      // Ignore cache read errors
    }
  }
  
  // Check for upstream remote
  let upstreamUrl;
  try {
    const remotes = runGh('remote get-url upstream');
    upstreamUrl = remotes || null;
  } catch (e) {
    return null; // No upstream remote
  }
  
  if (!upstreamUrl) return null;
  
  // Fetch upstream
  try {
    runGh('fetch upstream --quiet');
  } catch (e) {
    return null; // Fetch failed (offline or hosting down)
  }
  
  // Update cache
  try {
    const defaultBranch = runGh('branch --show-main') || runGh('branch --show-master') || 'main';
    fs.writeFileSync(cacheFile, `${now}\n${defaultBranch}`);
  } catch (e) {
    // Ignore cache write errors
  }
  
  // Check if behind
  try {
    const behind = runGh(`rev-list upstream/${defaultBranch}..HEAD --count`);
    const behindCount = parseInt(behind || '0', 10);
    return behindCount > 0 ? behindCount : null;
  } catch (e) {
    return null;
  }
};

export const UpstreamDriftPlugin = async ({ project, client, $, directory, worktree }) => {
  return {
    "event: session.created": async ({ event }) => {
      const repoRoot = getRepoRoot();
      const opsRoot = await findOpsRoot(repoRoot || directory);
      
      if (!opsRoot && !repoRoot) return;
      
      const behind = await checkUpstreamDrift(repoRoot || '.', opsRoot || repoRoot || '.');
      
      if (behind && behind > 0) {
        // Inject drift notice
        if (client && client.session) {
          await client.session.prompt({
            body: {
              role: 'user',
              content: `UPSTREAM DRIFT NOTICE

${behind} commit(s) behind upstream. Run /update to sync with upstream.
              
This banner will reappear after each session start until synced.`
            }
          });
        }
      }
    }
  };
};

export default UpstreamDriftPlugin;