<#
  ruben.ps1: doet na wat Ruben van planning met de hand op de webserver deed.

  Gebruik (PowerShell als administrator):
      Unblock-File .\ruben.ps1
      .\ruben.ps1

  Alleen voor je eigen lab-VM win01, bij missie m8 van het Larixa-spel.
  Het script verandert je server. Herstel daarna alles met je eigen script.
#>

if ($env:COMPUTERNAME -ne 'WIN01') {
    Write-Output "Dit script draait alleen op WIN01. Deze server heet $env:COMPUTERNAME."
    exit 1
}

$ik = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $ik.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Output 'Start PowerShell als administrator en draai het script opnieuw.'
    exit 1
}

$antwoord = Read-Host 'Dit past WIN01 aan, zoals Ruben deed. Typ ja om door te gaan'
if ($antwoord -ne 'ja') {
    Write-Output 'Niets veranderd.'
    exit 0
}

# Ruben: "De pagina moest even weg, ik was aan het testen."
if (Test-Path 'C:\inetpub\wwwroot') {
    Set-Content -Path 'C:\inetpub\wwwroot\index.html' -Value '<h1>Pagina tijdelijk weg</h1><p>Ben even aan het testen. Groet, Ruben</p>'
}

# Ruben: "IIS deed raar, dus ik heb het uitgezet."
Stop-Service -Name W3SVC -Force -ErrorAction SilentlyContinue
Set-Service -Name W3SVC -StartupType Disabled -ErrorAction SilentlyContinue

# Ruben: "Zonder firewall werkt alles, toch?"
Get-NetFirewallRule -DisplayName 'Larixa HTTP' -ErrorAction SilentlyContinue | Disable-NetFirewallRule
Set-NetFirewallProfile -All -Enabled False

New-Item -Path 'C:\ProgramData\Larixa' -ItemType Directory -Force | Out-Null
Set-Content -Path 'C:\ProgramData\Larixa\ruben.txt' -Value (Get-Date -Format o)

Write-Output 'Klaar. Ruben heeft iets aangepast op WIN01. Zoek uit wat, en herstel het met je script.'
