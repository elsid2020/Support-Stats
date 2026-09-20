$ver = ((Get-Content "$PSScriptRoot\info.json" -Raw | ConvertFrom-Json).version) -replace '\.', '-'
$base = "Support Stats-$ver"
$dst = "E:\my_extensions\$base.zip"
$i = 1
while (Test-Path $dst) {
    $dst = "E:\my_extensions\$base-$i.zip"
    $i++
}

$paths = @(
    "$PSScriptRoot\index.js",
    "$PSScriptRoot\info.json",
    "$PSScriptRoot\helmet1.png",
    "$PSScriptRoot\icon.svg",
    "$PSScriptRoot\GameStatsPage.jsx"
)

if (Test-Path "$PSScriptRoot\assets") {
    $paths += "$PSScriptRoot\assets\*"
}

Compress-Archive -Path $paths -DestinationPath $dst -Force
Write-Host "Created: $dst"
