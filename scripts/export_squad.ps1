# Script de Exportação do Squad Aiox (Orion System)
# Este script empacota o core e os workflows dos agentes para fácil compartilhamento.

$ErrorActionPreference = "Stop"

# Caminhos locais
$sourcePath = $PSScriptRoot
if ($sourcePath -eq "" -or $sourcePath -eq $null) {
    $sourcePath = Get-Location
}
# Caso executado de dentro da pasta scripts, ajusta para o root
if ($sourcePath.EndsWith("scripts")) {
    $parentPath = Split-Path -Parent $sourcePath
} else {
    $parentPath = $sourcePath
}

$zipName = "aiox-squad-bundle.zip"
$outputPath = Join-Path $parentPath $zipName

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "🚀 Iniciando empacotamento do Squad Aiox..." -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# Pastas e arquivos a serem incluídos
$itemsToPack = @(
    "$parentPath\.agent",
    "$parentPath\.aiox-core",
    "$parentPath\aiox.ps1"
)

# Verifica se os arquivos de origem existem
foreach ($item in $itemsToPack) {
    if (-not (Test-Path $item)) {
        Write-Error "Erro: O item obrigatório '$item' não foi encontrado."
    }
}

# Remove zip anterior se existir
if (Test-Path $outputPath) {
    Write-Host "Removendo arquivo ZIP anterior..." -ForegroundColor Yellow
    Remove-Item $outputPath -Force
}

# Criando estrutura temporária para compactação limpa
$tempDir = Join-Path $env:TEMP "aiox_pack_temp_$(Get-Random)"
New-Item -ItemType Directory -Path $tempDir | Out-Null

try {
    # Copia itens para o diretório temporário
    foreach ($item in $itemsToPack) {
        $name = Split-Path $item -Leaf
        $target = Join-Path $tempDir $name
        Copy-Item -Path $item -Destination $target -Recurse -Force
    }

    # Compacta a pasta temporária
    Write-Host "Compactando arquivos em $outputPath..." -ForegroundColor Yellow
    Compress-Archive -Path "$tempDir\*" -DestinationPath $outputPath -Force
    
    Write-Host ""
    Write-Host "✨ Squad Aiox empacotado com sucesso!" -ForegroundColor Green
    Write-Host "Arquivo criado: $outputPath" -ForegroundColor Green
    Write-Host "Você pode copiar este arquivo .zip para qualquer máquina ou projeto." -ForegroundColor White
}
catch {
    Write-Error "Falha ao compactar os arquivos: $_"
}
finally {
    # Limpa diretório temporário
    if (Test-Path $tempDir) {
        Remove-Item -Path $tempDir -Recurse -Force
    }
}
Write-Host "=============================================" -ForegroundColor Cyan
