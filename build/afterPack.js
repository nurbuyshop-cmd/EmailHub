// Sets the app icon + version info on the .exe using 64-bit rcedit (works under wine64 on Linux)
const { execFileSync } = require('child_process');
const path = require('path'); const os = require('os');
exports.default = async (ctx) => {
  if (ctx.electronPlatformName !== 'win32') return;
  const exe = path.join(ctx.appOutDir, 'Account Hub.exe');
  const rcedit = path.join(os.homedir(), '.cache/electron-builder/winCodeSign/winCodeSign-2.6.0/rcedit-x64.exe');
  const args = [rcedit, exe, '--set-icon', path.join(__dirname, 'icon.ico'),
    '--set-version-string', 'ProductName', 'Account Hub', '--set-version-string', 'FileDescription', 'Account Hub',
    '--set-version-string', 'CompanyName', 'NurBuy', '--set-file-version', '1.1.0', '--set-product-version', '1.1.0'];
  execFileSync(process.platform === 'win32' ? args.shift() : 'wine', process.platform === 'win32' ? args : args, { stdio: 'inherit', env: { ...process.env, WINEDEBUG: '-all' } });
};
