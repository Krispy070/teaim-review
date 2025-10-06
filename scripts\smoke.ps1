param(
  [string]$App = "http://127.0.0.1:5000",
  [Parameter(Mandatory=$true)][string]$Proj,
  [Parameter(Mandatory=$true)][string]$UserId,
  [Parameter(Mandatory=$true)][string]$OrgId,
  [string]$Email = "you@example.com"
)

$devHeaders = @{ "X-Dev-User"=$UserId; "X-Dev-Org"=$OrgId; "X-Dev-Role"="owner" }

Write-Host "`n--- Seed ---"
Invoke-RestMethod -Method Post -Uri "$App/api/dev/seed-simple?project_id=$Proj" -Headers $devHeaders | Out-Null

Write-Host "`n--- Smoke-run ---"
$smoke = Invoke-RestMethod -Method Post -Uri "$App/api/dev/smoke-run?project_id=$Proj" -Headers $devHeaders -Body (@{email_to=$Email} | ConvertTo-Json) -ContentType "application/json"
$smoke | ConvertTo-Json -Depth 6

Write-Host "`n--- Digest preview ---"
$devHeaders["X-Dev-Role"] = "pm"
Invoke-RestMethod -Uri "$App/api/digest/preview?project_id=$Proj" -Headers $devHeaders | ConvertTo-Json -Depth 6