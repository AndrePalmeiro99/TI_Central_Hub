# Script de Instalação/Importação do Squad Aiox (Orion System)
# Este script extrai os agentes e core em uma nova pasta de projeto.

param (
    [string]$TargetProjectDir = "."
)

$ErrorActionPreference = "Stop"

# Caminhos locais
$scriptPath = $PSScriptRoot
if ($scriptPath -eq "" -or $scriptPath -eq $null) {
    $scriptPath = Get-Location
}
if ($scriptPath.EndsWith("scripts")) {
    $rootPath = Split-Path -Parent $scriptPath
} else {
    $rootPath = $scriptPath
}

$zipPath = Join-Path $rootPath "aiox-squad-bundle.zip"
$resolvedTarget = Resolve-Path $TargetProjectDir -ErrorAction SilentlyContinue
if ($resolvedTarget -eq $null) {
    $resolvedTarget = New-Item -ItemType Directory -Path $TargetProjectDir -Force
}

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "⚙️ Iniciando instalação do Squad Aiox..." -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "Destino: $($resolvedTarget.FullName)" -ForegroundColor White

if (-not (Test-Path $zipPath)) {
    Write-Host "Erro: Arquivo '$zipPath' não encontrado!" -ForegroundColor Red
    Write-Host "Rode primeiro o script 'export_squad.ps1' para gerar o arquivo .zip." -ForegroundColor Yellow
    exit 1
}

try {
    # Extrai o ZIP no destino
    Write-Host "Extraindo arquivos do Squad..." -ForegroundColor Yellow
    Expand-Archive -Path $zipPath -DestinationPath $resolvedTarget.FullName -Force
    
    # Criando/Atualizando a regra global AGENTS.md na máquina local
    $globalConfigDir = Join-Path $env:USERPROFILE ".gemini\config"
    $globalAgentsFile = Join-Path $globalConfigDir "AGENTS.md"
    
    Write-Host "Configurando regras globais do sistema..." -ForegroundColor Yellow
    if (-not (Test-Path $globalConfigDir)) {
        New-Item -ItemType Directory -Path $globalConfigDir -Force | Out-Null
    }
    
    $globalRuleText = @"
# Diretrizes Gerais de Codificação - Antigravity (Orion System)
- Sempre utilize o padrão de design unificado (System Design Spec).
- Nunca declare chaves de API rígidas no código. Utilize variáveis de ambiente no arquivo `.env`.
- Realize revisões de segurança e commits estruturados.
"@

    if (-not (Test-Path $globalAgentsFile)) {
        New-Item -ItemType File -Path $globalAgentsFile -Force | Out-Null
        Set-Content -Path $globalAgentsFile -Value $globalRuleText -Encoding UTF8
        Write-Host "Arquivo global AGENTS.md registrado com sucesso em: $globalAgentsFile" -ForegroundColor Green
    } else {
        Write-Host "Arquivo global AGENTS.md já existe em: $globalAgentsFile (Mantido intacto)" -ForegroundColor Gray
    }

    Write-Host ""
    Write-Host "🎉 Instalação concluída com sucesso no projeto!" -ForegroundColor Green
    Write-Host "Pastas criadas no destino:" -ForegroundColor White
    Write-Host " - .agent/ (Workflows do Squad)" -ForegroundColor Gray
    Write-Host " - .aiox-core/ (Núcleo do Aiox)" -ForegroundColor Gray
    Write-Host " - aiox.ps1 (Script de controle)" -ForegroundColor Gray
}
catch {
    Write-Error "Falha ao instalar o Squad: $_"
}
Write-Host "=============================================" -ForegroundColor Cyan
