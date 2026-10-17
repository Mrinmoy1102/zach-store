# Creates icon.ico from the store logo and puts a "Zach Store Labels" shortcut on the Desktop.
# Run again any time to recreate the shortcut:  powershell -ExecutionPolicy Bypass -File install_shortcut.ps1
$ErrorActionPreference = 'Stop'
$tool = Split-Path -Parent $MyInvocation.MyCommand.Path
$icon = Join-Path $tool 'icon.ico'
$logo = Join-Path (Split-Path -Parent $tool) 'assets\zach-logo-mark.png'

$python = (Get-Command python -ErrorAction Stop).Source
$pythonw = Join-Path (Split-Path -Parent $python) 'pythonw.exe'
if (-not (Test-Path $pythonw)) { throw "pythonw.exe not found next to $python" }

# Square, padded icon in the usual Windows sizes.
& $python -I -c @"
import sys
from PIL import Image
logo = Image.open(sys.argv[1]).convert('RGBA')
side = max(logo.size)
canvas = Image.new('RGBA', (side, side), (243, 242, 242, 255))
canvas.paste(logo, ((side - logo.width) // 2, (side - logo.height) // 2), logo)
canvas.save(sys.argv[2], sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
"@ $logo $icon

$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'Zach Store Labels.lnk'
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($lnkPath)
$lnk.TargetPath = $pythonw
$lnk.Arguments = '"' + (Join-Path $tool 'app.pyw') + '"'
$lnk.WorkingDirectory = $tool
$lnk.IconLocation = "$icon,0"
$lnk.Description = 'Build the Zach Store item list and shelf labels PDF from the inventory'
$lnk.Save()
Write-Output "Shortcut created: $lnkPath"
