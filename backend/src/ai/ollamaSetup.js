import { spawn, exec } from 'child_process';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Helper to execute a command and return stdout/stderr or error
 */
function execCmd(cmd) {
  return new Promise((resolve) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        resolve({ err: error, stdout, stderr });
      } else {
        resolve({ err: null, stdout, stderr });
      }
    });
  });
}

/**
 * Pings the local Ollama tags endpoint
 */
async function pingOllama(url) {
  try {
    const res = await fetch(`${url}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Starts the Ollama service locally in the background
 */
function startOllamaService() {
  logger.info('Attempting to start Ollama service in background...');
  try {
    const proc = spawn('ollama', ['serve'], {
      detached: true,
      stdio: 'ignore',
      shell: true,
    });
    proc.unref();
  } catch (err) {
    logger.error('Failed to launch ollama serve subprocess', { error: err.message });
  }
}

/**
 * Ensure local Ollama runtime is ready.
 */
export async function ensureOllamaReady() {
  const baseUrl = (env.ai.ollamaBaseUrl || 'http://localhost:11434').replace(/\/$/, '');
  const modelName = env.ai.ollamaModel || 'llama3.2';

  logger.info('Initializing Ollama check...', { baseUrl, modelName });

  // 1. Ping the endpoint
  let isUp = await pingOllama(baseUrl);
  if (!isUp) {
    logger.warn('Ollama service is down. Checking if ollama CLI is available on PATH...');
    
    // Check if CLI is installed
    const { err } = await execCmd('ollama --version');
    if (err) {
      logger.warn('Ollama CLI not found on PATH. Attempting winget auto-installation...');
      
      const installRes = await execCmd('winget install -e --id Ollama.Ollama --accept-package-agreements --accept-source-agreements');
      if (installRes.err) {
        logger.error('winget installation failed. Please install Ollama manually.', {
          error: installRes.err.message,
          stderr: installRes.stderr,
        });
        logger.info('Manual installation: Download from https://ollama.com/download');
        return false;
      }
      
      logger.info('Ollama installed via winget successfully. Waiting 10 seconds for installation registry sync...');
      await new Promise((r) => setTimeout(r, 10000));
    }

    // Try starting the service
    startOllamaService();

    // Retry pinging with exponential backoff (max 5 retries)
    for (let i = 1; i <= 6; i++) {
      const waitTime = i * 2000;
      logger.info(`Waiting ${waitTime / 1000}s for Ollama service to boot (attempt ${i}/6)...`);
      await new Promise((r) => setTimeout(r, waitTime));
      isUp = await pingOllama(baseUrl);
      if (isUp) {
        logger.info('Ollama service successfully booted.');
        break;
      }
    }
  }

  if (!isUp) {
    logger.error('Ollama service is still unreachable. Setup aborted.');
    return false;
  }

  // 2. Check if model exists
  logger.info('Checking installed models in Ollama...');
  try {
    const res = await fetch(`${baseUrl}/api/tags`);
    if (!res.ok) {
      logger.error('Failed to list Ollama models');
      return false;
    }

    const data = await res.json();
    const installedModels = data.models || [];
    
    // Check if modelName (or modelName:latest) matches
    const hasModel = installedModels.some((m) => {
      const name = m.name || '';
      return (
        name.toLowerCase() === modelName.toLowerCase() ||
        name.toLowerCase().startsWith(`${modelName.toLowerCase()}:`) ||
        modelName.toLowerCase().startsWith(`${name.toLowerCase()}:`)
      );
    });

    if (hasModel) {
      logger.info(`Model '${modelName}' is already pulled and ready to use.`);
      return true;
    }

    // Pull model via API (non-blocking server bootstrap, but logs progress)
    logger.info(`Model '${modelName}' is not installed. Initiating pull request...`);
    
    // We fetch without stream: false to read progress updates or we can just stream: false for simplicity
    const pullRes = await fetch(`${baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName, stream: false }),
    });

    if (!pullRes.ok) {
      logger.error(`Failed to trigger pull for model '${modelName}'`, { status: pullRes.status });
      return false;
    }

    const pullData = await pullRes.json();
    if (pullData.status === 'success') {
      logger.info(`Model '${modelName}' pulled successfully.`);
      return true;
    } else {
      logger.error(`Ollama model pull status is not success: ${JSON.stringify(pullData)}`);
      return false;
    }
  } catch (err) {
    logger.error('Error verifying/pulling Ollama model', { error: err.message });
    return false;
  }
}
