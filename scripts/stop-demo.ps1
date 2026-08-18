# ============================================================
# MiniSaaS ERP 演示环境一键停止（PowerShell）
# 用法: 双击 stop-demo.bat 或执行 powershell -File scripts\stop-demo.ps1
# ============================================================
$ErrorActionPreference = 'SilentlyContinue'

Write-Host '============================================'
Write-Host '  MiniSaaS ERP 演示环境一键停止'
Write-Host '============================================'

# 按端口停止前后端
foreach ($port in 3000, 5173) {
  Get-NetTCPConnection -LocalPort $port -State Listen |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
}

# 停止隧道
Get-Process cloudflared | Stop-Process -Force

Start-Sleep -Seconds 2

# 兜底清理残留 node 服务进程（只杀本项目相关端口）
$left = @()
foreach ($port in 3000, 5173) {
  if (Get-NetTCPConnection -LocalPort $port -State Listen) { $left += $port }
}
if ($left.Count -eq 0) {
  Write-Host '已停止，端口 3000/5173 已释放。'
} else {
  Write-Host "仍有残留端口: $($left -join ', ')，请稍后重试。"
}
Write-Host ''
