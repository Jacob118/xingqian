const updateUrl = String(process.env.XINGQIAN_UPDATE_URL || '').trim().replace(/\/+$/, '');
const githubOwner = String(process.env.XINGQIAN_GITHUB_OWNER || '').trim();
const githubRepo = String(process.env.XINGQIAN_GITHUB_REPO || '').trim();
const hasWindowsSigningCertificate = Boolean(process.env.WIN_CSC_LINK || process.env.CSC_LINK);

if (updateUrl && (githubOwner || githubRepo)) {
  throw new Error('Choose either XINGQIAN_UPDATE_URL or GitHub owner/repo, not both.');
}
if (Boolean(githubOwner) !== Boolean(githubRepo)) {
  throw new Error('Set both XINGQIAN_GITHUB_OWNER and XINGQIAN_GITHUB_REPO.');
}
if (updateUrl) {
  const parsed = new URL(updateUrl);
  if (parsed.protocol !== 'https:') {
    throw new Error('XINGQIAN_UPDATE_URL must use HTTPS.');
  }
}

module.exports = {
  appId: 'com.xingqian.desktop',
  productName: '醒签',
  directories: { output: 'release' },
  files: ['src/**/*', 'package.json'],
  mac: {
    target: 'dmg',
    category: 'public.app-category.productivity'
  },
  win: {
    target: 'nsis',
    ...((updateUrl || githubOwner) ? {
      publish: [updateUrl
        ? { provider: 'generic', url: updateUrl }
        : { provider: 'github', owner: githubOwner, repo: githubRepo, releaseType: 'release' }],
      // This project currently ships without an Authenticode certificate.
      // Turn publisher verification back on when a stable signing certificate is configured.
      verifyUpdateCodeSignature: hasWindowsSigningCertificate
    } : {})
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true
  }
};
