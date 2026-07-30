<#
    Shared owner identity table. ESPN (and the old workbook) refer to the same
    person with slightly different strings across seasons/sources; this maps every
    variant seen to one stable slug + display name.
#>

$script:OwnerCanon = @(
    @{ slug = "charlie-wright";   displayName = "Charlie Wright";   rawNames = @("Charlie Wright") }
    @{ slug = "pat-elliott";      displayName = "Pat Elliott";      rawNames = @("Pat Elliott", "Patrick Elliott") }
    @{ slug = "michael-cole";     displayName = "Michael Cole";     rawNames = @("Michael Cole") }
    @{ slug = "will-samuel";      displayName = "Will Samuel";      rawNames = @("William Samuel", "Will Samuel") }
    @{ slug = "noah-jordan";      displayName = "Noah Jordan";      rawNames = @("Noah Jordan") }
    @{ slug = "patrick-culcasi";  displayName = "Patrick Culcasi";  rawNames = @("Patrick Culcasi") }
    @{ slug = "greg-nieskens";    displayName = "Greg Nieskens";    rawNames = @("gregory nieskens", "Gregory Nieskens", "Greg Nieskens") }
    @{ slug = "kyle-roche";       displayName = "Kyle Roche";       rawNames = @("Kyle Roche") }
    @{ slug = "carter-davis";     displayName = "Carter Davis";     rawNames = @("Carter Davis") }
    @{ slug = "tommy-denlinger";  displayName = "Tommy Denlinger";  rawNames = @("Tommy Denlinger") }
    @{ slug = "tommy-alexander";  displayName = "Tommy Alexander";  rawNames = @("Tommy Alexander") }
    @{ slug = "brooks-rush";      displayName = "Brooks Rush";      rawNames = @("Daryn Rush", "Brooks Rush") }
)

$script:OwnerLookup = @{}
foreach ($o in $script:OwnerCanon) {
    foreach ($raw in $o.rawNames) {
        $script:OwnerLookup[$raw.ToLowerInvariant()] = $o
    }
}

function Get-OwnerBySlug([string]$slug) {
    return $script:OwnerCanon | Where-Object { $_.slug -eq $slug } | Select-Object -First 1
}

function ConvertTo-OwnerSlug([string]$rawName) {
    if (-not $rawName) { return $null }
    $key = $rawName.ToLowerInvariant()
    if ($script:OwnerLookup.ContainsKey($key)) {
        return $script:OwnerLookup[$key].slug
    }
    Write-Warning "Unknown owner name encountered: '$rawName' (not in OwnerCanon map)"
    return ($rawName -replace '\s+', '-').ToLowerInvariant()
}

function ConvertTo-OwnerDisplayName([string]$rawName) {
    $key = $rawName.ToLowerInvariant()
    if ($script:OwnerLookup.ContainsKey($key)) {
        return $script:OwnerLookup[$key].displayName
    }
    return $rawName
}

function Round2($n) {
    if ($null -eq $n) { return $null }
    return [math]::Round([double]$n, 2)
}

function Round4($n) {
    if ($null -eq $n) { return $null }
    return [math]::Round([double]$n, 4)
}
