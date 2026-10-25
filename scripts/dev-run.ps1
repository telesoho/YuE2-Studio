# Exes built inside this checkout inherit its Low integrity label, so Windows
# starts them at Low and they cannot create files in %LOCALAPPDATA%. Raise the
# binary to Medium before launching it. Installed copies are not labeled Low.
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string] $Bin,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $Rest
)

& icacls.exe $Bin /setintegritylevel M | Out-Null
if ($Rest) { & $Bin @Rest } else { & $Bin }
if ($null -eq $LASTEXITCODE) { exit 0 }
exit $LASTEXITCODE
