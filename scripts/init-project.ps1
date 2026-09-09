$ErrorActionPreference = 'Stop'

function Ask([string]$Prompt, [string]$DefaultValue = '') {
  $suffix = if ($DefaultValue) { " [$DefaultValue]" } else { '' }
  $value = Read-Host "$Prompt$suffix"
  if ([string]::IsNullOrWhiteSpace($value)) { return $DefaultValue }
  return $value
}

Write-Host "Project initialization (will generate .env files)."

$projectName = Ask "Project name" "cursor-master-template"
$traefikHost = Ask "Traefik host (domain)" "example.com"
$traefikStack = Ask "Traefik stack slug (used in router/service names)" "cmt"
$traefikNetwork = Ask "Traefik external network name" "web"
$backendPrefix = Ask "Backend path prefix" "/backend"

$publicStyle = Ask "Public web style (one-page|multipage)" "one-page"

$colorPrimary = Ask "Theme color: primary (hex)" ""
$colorBackground = Ask "Theme color: background (hex)" ""
$colorText = Ask "Theme color: text (hex)" ""
$colorAccent = Ask "Theme color: accent (hex)" ""
$colorSuccess = Ask "Theme color: success (hex)" ""
$colorDanger = Ask "Theme color: danger (hex)" ""

$dbHost = Ask "DB host" "localhost"
$dbPort = Ask "DB port" "3306"
$dbName = Ask "DB name" $projectName
$dbUser = Ask "DB user" "root"
$dbPass = Ask "DB password" ""

$uploadsHostDir = Ask "Uploads host dir (bind mount)" "/mnt/shared-app-files/$projectName"

$rootEnv = @"
PROJECT_NAME=$projectName
TRAEFIK_STACK=$traefikStack
TRAEFIK_HOST=$traefikHost
TRAEFIK_NETWORK=$traefikNetwork
TRAEFIK_ENTRYPOINT=websecure
TRAEFIK_TLS=true
BACKEND_PATH_PREFIX=$backendPrefix
UPLOADS_HOST_DIR=$uploadsHostDir
"@
Set-Content -LiteralPath ".env" -Value $rootEnv -Encoding UTF8
Write-Host "Wrote .env"

$backendEnv = @"
DATABASE_URL=mysql://${dbUser}:${dbPass}@${dbHost}:$dbPort/$dbName
PORT=10001
UPLOAD_ROOT=/usr/app/uploads
"@
Set-Content -LiteralPath "backend/.env" -Value $backendEnv -Encoding UTF8
Write-Host "Wrote backend/.env"

$frontendEnv = @"
VITE_API_BASE_URL=https://$traefikHost$backendPrefix
"@
Set-Content -LiteralPath "frontend/.env" -Value $frontendEnv -Encoding UTF8
Write-Host "Wrote frontend/.env"

if (-not (Test-Path -LiteralPath ".cursor/docs/matrices")) {
  New-Item -ItemType Directory -Force ".cursor/docs/matrices" | Out-Null
}

if (-not (Test-Path -LiteralPath ".cursor/docs/theme.md")) {
  $themeDoc = @"
# Theme

## Public style

- $publicStyle

## Color scheme

- primary: $colorPrimary
- background: $colorBackground
- text: $colorText
- accent: $colorAccent
- success: $colorSuccess
- danger: $colorDanger

Notes:
- Owner should define exact meaning/usage for each color (buttons, links, surfaces, alerts).
"@
  Set-Content -LiteralPath ".cursor/docs/theme.md" -Value $themeDoc -Encoding UTF8
  Write-Host "Wrote .cursor/docs/theme.md"
}

if (-not (Test-Path -LiteralPath ".cursor/docs/matrices/.first-raw-task")) {
  Set-Content -LiteralPath ".cursor/docs/matrices/.first-raw-task" -Value "Create first feature matrix folder when first raw task arrives." -Encoding UTF8
  Write-Host "Created .cursor/docs/matrices/.first-raw-task marker"
}

$firstFeatureSlug = Ask "First feature slug for matrix folder (optional, Enter to skip)" ""

if (-not [string]::IsNullOrWhiteSpace($firstFeatureSlug)) {
  $templateMatrixPath = ".cursor/docs/matrices/example_feature"
  $targetMatrixPath = ".cursor/docs/matrices/$firstFeatureSlug"

  if (-not (Test-Path -LiteralPath $templateMatrixPath)) {
    Write-Host "Matrix template folder not found: $templateMatrixPath (skipping matrix creation)"
  } elseif (Test-Path -LiteralPath $targetMatrixPath) {
    Write-Host "Matrix folder already exists: $targetMatrixPath (skipping)"
  } else {
    Copy-Item -Recurse -Force $templateMatrixPath $targetMatrixPath
    Get-ChildItem -Recurse -File $targetMatrixPath | ForEach-Object {
      (Get-Content -LiteralPath $_.FullName) -replace 'example_feature', $firstFeatureSlug | Set-Content -LiteralPath $_.FullName -Encoding UTF8
    }
    Write-Host "Created matrix folder: $targetMatrixPath"
  }
}

Write-Host "Done. You can now run: docker compose up -d --build"

