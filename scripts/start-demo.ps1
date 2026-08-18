# ============================================================
# MiniSaaS ERP 演示环境一键启动（PowerShell）
# 用法: 双击 start-demo.bat 或执行 powershell -File scripts\start-demo.ps1
# 前置: 本机 MySQL 服务运行中（MySQL80）
# ============================================================
$ErrorActionPreference = 'SilentlyContinue'
$base = 'D:\Test03'
$tunnelErr = "$base\scripts\tunnel-err.log"

Write-Host '============================================'
Write-Host '  MiniSaaS ERP 演示环境一键启动'
Write-Host '============================================'

# 1. 后端 API (3000)
Write-Host '[1/3] 启动后端 API (localhost:3000)...'
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm run dev' `
  -WorkingDirectory "$base\server" -WindowStyle Hidden | Out-Null

# 2. 前端 (5173)
Write-Host '[2/3] 启动前端 (localhost:5173)...'
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm run dev' `
  -WorkingDirectory "$base\web" -WindowStyle Hidden | Out-Null

# 3. 公网隧道 (Cloudflare Tunnel)
Write-Host '[3/3] 启动公网隧道 (Cloudflare Tunnel)...'
Start-Process -FilePath 'C:\Program Files (x86)\cloudflared\cloudflared.exe' `
  -ArgumentList 'tunnel', '--url', 'http://localhost:5173', '--no-autoupdate' `
  -WindowStyle Hidden -RedirectStandardError $tunnelErr | Out-Null

Write-Host ''
Write-Host '已全部启动，等待 3-5 秒后：'
Write-Host '  - 本地访问: http://localhost:5173  (账号 admin / 密码 admin123)'
Write-Host '  - 公网地址: 查看 scripts\tunnel-err.log 中的 https://xxx.trycloudflare.com'
Write-Host '    (若隧道因网络超时未生成，重新运行本脚本即可)'
Write-Host '  - 停止环境: 双击 stop-demo.bat'
Write-Host ''