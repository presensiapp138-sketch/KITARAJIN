/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export default function handler(_req: any, res: any) {
  const proc = (globalThis as any).process;
  const env = (proc && proc.env) || {};

  const webAppUrl = String(
    env.APPS_SCRIPT_URL || env.VITE_APPS_SCRIPT_URL || ''
  ).trim();
  const apiToken = String(
    env.APPS_SCRIPT_TOKEN || env.VITE_APPS_SCRIPT_TOKEN || ''
  ).trim();

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (!webAppUrl || !apiToken) {
    res.status(200).json({
      configured: false,
      webAppUrl: '',
      apiToken: '',
      isLocked: false,
    });
    return;
  }

  res.status(200).json({
    configured: true,
    webAppUrl,
    apiToken,
    isLocked: true,
  });
}
