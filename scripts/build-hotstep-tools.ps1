param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$OutputDirectory,
    [ValidateSet('universal', 'sm_89')]
    [string]$CudaArchitecture = 'universal'
)

# Builds HOT-Step's tools at the pinned commit as one package - the adapter
# trainer (ace-train, staged as music-train.exe), the audio-to-MIDI transcriber
# (ace-midi, staged as music-midi.exe) and the captioner (ace-caption) - on one
# set of ggml libraries, zipped for the release asset that the training pack
# and Audio to MIDI both download into one folder. Its ggml carries HOT-Step's
# patches, so it never shares a folder with the engine's.

$PSDefaultParameterValues['*:ErrorAction'] = 'Stop'
$ErrorActionPreference = 'Continue'

$repoRoot = Split-Path -Parent $PSScriptRoot
$source = Get-Content -Raw (Join-Path $repoRoot 'engines\music-train-source.json') | ConvertFrom-Json
$midi = Get-Content -Raw (Join-Path $repoRoot 'engines\music-midi-source.json') | ConvertFrom-Json
foreach ($field in 'repository', 'commit', 'release_tag', 'asset', 'cuda_architectures') {
    if ($source.$field -ne $midi.$field) { throw "engines\music-midi-source.json and music-train-source.json name different $field ($($midi.$field) / $($source.$field)): the tools are one package." }
}
$buildRoot = if ($env:YUE_ENGINE_BUILD_ROOT) { $env:YUE_ENGINE_BUILD_ROOT } else { $env:TEMP }
$worktree = Join-Path $buildRoot "hotstep-$($source.commit.Substring(0, 8))"

function Get-VcVars64 {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    if (-not (Test-Path $vswhere)) { throw 'vswhere.exe was not found; install Visual Studio C++ Build Tools.' }
    $installationPath = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($installationPath)) { throw 'No Visual Studio C++ build installation was found.' }
    $vcvars = Join-Path $installationPath.Trim() 'VC\Auxiliary\Build\vcvars64.bat'
    if (-not (Test-Path $vcvars)) { throw "vcvars64.bat is missing: $vcvars" }
    return $vcvars
}

if (-not (Get-Command nvcc -ErrorAction SilentlyContinue)) { throw 'The trainer is CUDA only: nvcc is required.' }
if (-not (Get-Command ninja -ErrorAction SilentlyContinue)) { throw 'Ninja is required on PATH.' }

if (-not (Test-Path (Join-Path $worktree '.git'))) {
    git clone $source.repository $worktree
    if ($LASTEXITCODE -ne 0) { throw 'Could not clone HOT-Step-CPP.' }
}
git -C $worktree fetch origin $source.commit
if ($LASTEXITCODE -ne 0) { throw "Could not fetch HOT-Step-CPP commit $($source.commit)." }
git -C $worktree checkout --detach $source.commit
if ($LASTEXITCODE -ne 0) { throw "Could not check out HOT-Step-CPP commit $($source.commit)." }
# ggml carries the training patches; the VST3 SDK is only needed for the
# build tree to configure.
git -C $worktree submodule update --init --recursive engine/ggml engine/vendor/vst3sdk
if ($LASTEXITCODE -ne 0) { throw 'Could not initialise the HOT-Step submodules.' }

# BF16 training needs Ampere or newer; transcription runs on Turing too.
$universal = if ($source.cuda_architectures) { $source.cuda_architectures } else { '80-real;86-real;89-real;90-real;120a-real;120-virtual' }
$cudaArch = switch ($CudaArchitecture) {
    'universal' { "`"-DCMAKE_CUDA_ARCHITECTURES=$universal`"" }
    'sm_89' { '-DCMAKE_CUDA_ARCHITECTURES=89' }
}
$buildDirectory = "build-tools-$CudaArchitecture"
$symbols = '-DCMAKE_MSVC_DEBUG_INFORMATION_FORMAT=ProgramDatabase -DCMAKE_EXE_LINKER_FLAGS=/DEBUG -DCMAKE_SHARED_LINKER_FLAGS=/DEBUG'
$parallelism = [Math]::Max(1, [Math]::Floor([Environment]::ProcessorCount * 0.8))
# Both tools load each ggml backend as a library, with a build of ggml-cpu for
# every processor generation: without the CUDA 13 runtime, on a card CUDA 13 has
# no code for, or on a processor without AVX2 they start on what is there
# instead of stopping with "no backend available" or 0xc000001d. Vulkan is not
# built: the transcriber's Vulkan path writes wrong notes (HOT-Step 3e7a0778 and
# 91e92a8a alike), and the trainer computes on CUDA. The training release also
# carries ace-caption, the captioner, which runs without the trainer.
$backends = '-DGGML_CUDA=ON -DGGML_VULKAN=OFF -DGGML_BACKEND_DL=ON -DGGML_CPU_ALL_VARIANTS=ON'
$tools = "$($source.target) $($midi.target) ace-caption"
$configure = "call `"$(Get-VcVars64)`" >nul && set `"VSLANG=1033`" && cmake -S . -B `"$buildDirectory`" -G Ninja -DCMAKE_BUILD_TYPE=Release -DGGML_NATIVE=OFF -DGGML_CCACHE=OFF $backends $symbols $cudaArch"
Push-Location (Join-Path $worktree $source.source_dir)
try { & cmd.exe /d /s /c $configure | Out-Host } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw 'Configuring the HOT-Step tools failed.' }
# every processor variant is a target of its own: ggml-cpu-haswell, ggml-cpu-alderlake...
$ninja = Get-Content -Raw (Join-Path $worktree "$($source.source_dir)\$buildDirectory\build.ninja")
$variants = [regex]::Matches($ninja, '(?m)^build (ggml-cpu-[a-z0-9_]+): phony') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
if ($variants.Count -eq 0) { throw 'The configured build has no processor variants of ggml-cpu.' }
$targets = "$tools ggml-cuda $($variants -join ' ')"
$command = "call `"$(Get-VcVars64)`" >nul && set `"VSLANG=1033`" && cmake --build `"$buildDirectory`" --target $targets --parallel $parallelism"
Push-Location (Join-Path $worktree $source.source_dir)
try { & cmd.exe /d /s /c $command | Out-Host } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw 'The HOT-Step tools build failed.' }

$binDirectory = Join-Path $worktree "$($source.source_dir)\$buildDirectory"

$output = [System.IO.Path]::GetFullPath($OutputDirectory)
if ($output -eq [System.IO.Path]::GetPathRoot($output)) { throw 'OutputDirectory must be a specific child directory, not a drive root.' }
if (Test-Path $output) { Remove-Item -Recurse -Force $output }
New-Item -ItemType Directory -Force -Path $output | Out-Null
foreach ($tool in @(@{ target = $source.target; shipped = $source.shipped_as }, @{ target = $midi.target; shipped = $midi.shipped_as }, @{ target = 'ace-caption'; shipped = 'ace-caption.exe' })) {
    $built = Join-Path $binDirectory "$($tool.target).exe"
    if (-not (Test-Path $built)) { throw "The build completed without $($tool.target).exe." }
    Copy-Item $built (Join-Path $output $tool.shipped) -Force
}
Get-ChildItem -Path $binDirectory -Filter 'ggml*.dll' -File | Copy-Item -Destination $output -Force
Copy-Item (Join-Path $worktree "$($source.source_dir)\LICENSE") (Join-Path $output 'LICENSE-HOT-Step.txt') -Force

$stamp = [pscustomobject]@{ commit = $source.commit; cuda_architecture = $CudaArchitecture; runtimes = @($source.shipped_as, $midi.shipped_as, 'ace-caption.exe') }
[System.IO.File]::WriteAllText((Join-Path $output 'runtime.json'), ($stamp | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))

$zip = Join-Path (Split-Path -Parent $output) $source.asset
if (Test-Path $zip) { Remove-Item -Force $zip }
Compress-Archive -Path "$output\*" -DestinationPath $zip -Force
[pscustomobject]@{ zip = $zip; bytes = (Get-Item $zip).Length; commit = $source.commit } | ConvertTo-Json -Compress

& {
    # the captioner's own asset: ggml without the CUDA backend, which it finds beside the trainer when that is installed
    $captioner = "$output-caption"
    if (Test-Path $captioner) { Remove-Item -Recurse -Force $captioner }
    New-Item -ItemType Directory -Force -Path $captioner | Out-Null
    $caption = Join-Path $binDirectory 'ace-caption.exe'
    if (-not (Test-Path $caption)) { throw 'The build completed without ace-caption.exe.' }
    Copy-Item $caption $captioner -Force
    Get-ChildItem -Path $binDirectory -Filter 'ggml*.dll' -File | Where-Object { $_.Name -ne 'ggml-cuda.dll' } | Copy-Item -Destination $captioner -Force
    Copy-Item (Join-Path $worktree "$($source.source_dir)\LICENSE") (Join-Path $captioner 'LICENSE-HOT-Step.txt') -Force
    $captionZip = Join-Path (Split-Path -Parent $output) 'ace-caption-windows-x64.zip'
    if (Test-Path $captionZip) { Remove-Item -Force $captionZip }
    Compress-Archive -Path "$captioner\*" -DestinationPath $captionZip -Force
    [pscustomobject]@{ zip = $captionZip; bytes = (Get-Item $captionZip).Length; commit = $source.commit } | ConvertTo-Json -Compress
}
