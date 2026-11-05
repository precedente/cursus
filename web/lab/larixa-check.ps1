<#
  larixa-check.ps1: controleert je labserver voor een missie van Larixa Logistiek.

  Gebruik (PowerShell als administrator):
      Unblock-File .\larixa-check.ps1
      .\larixa-check.ps1 m1

  Dit script verandert niets aan je server. Het kijkt alleen. Per controle zie
  je wat al goed is en wat nog niet. Is alles goed, dan krijg je een code voor
  het spel. Die code hoort bij jouw labsleutel: voor een klasgenoot werkt hij niet.
#>
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidUsingWriteHost', '', Justification = 'Gekleurde uitvoer voor de student')]
param(
    [Parameter(Position = 0)]
    [string]$Missie = ''
)

$script:Fouten = 0
$script:Sleutel = ''
$LabMap = 'C:\Larixa'

function Write-Goed([string]$Wat) {
    Write-Host '  [OK] ' -ForegroundColor Green -NoNewline
    Write-Host $Wat
}

function Write-Fout([string]$Wat, [string]$Tip) {
    Write-Host '  [X]  ' -ForegroundColor Red -NoNewline
    Write-Host $Wat
    if ($Tip) { Write-Host "       $Tip" -ForegroundColor Yellow }
    $script:Fouten++
}

# Invoke-Controle "wat je controleert" "tip als het niet goed is" { test }
function Invoke-Controle([string]$Wat, [string]$Tip, [scriptblock]$Test) {
    $ok = $false
    try { $ok = [bool](& $Test) } catch { $ok = $false }
    if ($ok) { Write-Goed $Wat } else { Write-Fout $Wat $Tip }
}

function Get-MissieCode([string]$MissieId, [string]$LabSleutel) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $bytes = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes("larixa|$MissieId|$LabSleutel"))
    $hex = -join ($bytes[0..3] | ForEach-Object { $_.ToString('X2') })
    return '{0}-{1}' -f $hex.Substring(0, 4), $hex.Substring(4, 4)
}

# --- groepen controles ------------------------------------------------------

function Test-Basis {
    Invoke-Controle 'De servernaam is WIN01' 'Stel de naam in, bijvoorbeeld met: Rename-Computer -NewName WIN01 -Restart' {
        $env:COMPUTERNAME -eq 'WIN01'
    }
    Invoke-Controle 'Het IP-adres is 192.168.150.31' 'Kijk naar de instellingen van je netwerkkaart.' {
        Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop | Where-Object IPAddress -eq '192.168.150.31'
    }
    Invoke-Controle "Je labsleutel staat in $LabMap\labsleutel.txt" 'Zet de labsleutel uit het spel in dat bestand, precies zoals hij in het spel staat.' {
        $script:Sleutel -cmatch '^LRX-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$'
    }
}

function Test-Tijdzone {
    Invoke-Controle 'De tijdzone is W. Europe Standard Time' 'Kijk wat Get-TimeZone zegt.' {
        (Get-TimeZone).Id -eq 'W. Europe Standard Time'
    }
}

function Test-Bouwinfo {
    Invoke-Controle "$LabMap\bouwinfo.txt zegt methode=antwoordbestand" 'Laat je antwoordbestand dit bestand maken.' {
        Get-Content (Join-Path $LabMap 'bouwinfo.txt') -ErrorAction Stop | Where-Object { $_.Trim() -eq 'methode=antwoordbestand' }
    }
    Invoke-Controle 'Windows is geinstalleerd met een antwoordbestand' 'Zet Autounattend.xml in de hoofdmap van de tweede iso en installeer opnieuw.' {
        (Test-Path "$env:WINDIR\Panther\unattend.xml") -or (Test-Path "$env:WINDIR\Panther\Unattend\unattend.xml")
    }
}

function Test-Web {
    Invoke-Controle 'De webserverrol IIS is geinstalleerd' 'Laat je script de rol Web-Server installeren.' {
        (Get-WindowsFeature -Name Web-Server -ErrorAction Stop).Installed
    }
    Invoke-Controle 'IIS draait' 'Laat je script de dienst W3SVC starten.' {
        (Get-Service -Name W3SVC -ErrorAction Stop).Status -eq 'Running'
    }
    Invoke-Controle 'IIS start vanzelf na een herstart' 'Zet het opstarttype van W3SVC op Automatic.' {
        (Get-Service -Name W3SVC -ErrorAction Stop).StartType -eq 'Automatic'
    }
    Invoke-Controle 'Je labsleutel staat op de startpagina' 'Bekijk de pagina met: Invoke-WebRequest http://localhost/ -UseBasicParsing' {
        $script:Sleutel -and ((Invoke-WebRequest -Uri 'http://localhost/' -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop).Content -cmatch [regex]::Escape($script:Sleutel))
    }
}

function Test-Firewall {
    Invoke-Controle 'De Windows Firewall staat aan voor alle profielen' 'Kijk wat Get-NetFirewallProfile zegt.' {
        $profielen = @(Get-NetFirewallProfile -ErrorAction Stop)
        ($profielen.Count -ge 3) -and (@($profielen | Where-Object { $_.Enabled -ne 'True' }).Count -eq 0)
    }
    Invoke-Controle "De firewallregel 'Larixa HTTP' staat poort 80 toe" "Maak een ingeschakelde regel met de naam 'Larixa HTTP' voor TCP-poort 80." {
        Get-NetFirewallRule -DisplayName 'Larixa HTTP' -ErrorAction Stop |
            Where-Object { $_.Enabled -eq 'True' -and $_.Direction -eq 'Inbound' -and $_.Action -eq 'Allow' } |
            Get-NetFirewallPortFilter |
            Where-Object { $_.Protocol -eq 'TCP' -and @($_.LocalPort) -contains '80' }
    }
}

function Test-Beveiliging {
    Invoke-Controle 'De gebruiker samira bestaat' 'Laat je script de lokale gebruiker aanmaken.' {
        Get-LocalUser -Name 'samira' -ErrorAction Stop
    }
    Test-Firewall
}

function Test-Ruben {
    Invoke-Controle 'Het script van Ruben is gedraaid' 'Draai eerst ruben.ps1. Dat hoort bij deze missie.' {
        Test-Path 'C:\ProgramData\Larixa\ruben.txt'
    }
}

# --- start ------------------------------------------------------------------

$geldig = @('m1', 'm4', 'm5', 'm6', 'm7', 'm8')
if ($geldig -notcontains $Missie) {
    Write-Host 'Gebruik: .\larixa-check.ps1 <missie>'
    Write-Host "Missies met een check: $($geldig -join ', ')."
    exit 2
}

$ik = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $ik.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host 'Start PowerShell als administrator en draai het script opnieuw.'
    exit 2
}

$sleutelBestand = Join-Path $LabMap 'labsleutel.txt'
if (Test-Path $sleutelBestand) { $script:Sleutel = (Get-Content $sleutelBestand -Raw).Trim() }

Write-Host ''
Write-Host "Larixa-check voor missie $Missie op WIN01"
Write-Host ''

switch ($Missie) {
    'm1' { Test-Basis; Test-Tijdzone }
    'm4' { Test-Basis; Test-Tijdzone; Test-Bouwinfo }
    'm5' { Test-Basis; Test-Web }
    'm6' { Test-Basis; Test-Web; Test-Beveiliging }
    'm7' { Test-Basis; Test-Bouwinfo; Test-Web; Test-Beveiliging }
    'm8' { Test-Basis; Test-Ruben; Test-Web; Test-Firewall }
}

Write-Host ''
if ($script:Fouten -eq 0) {
    $code = Get-MissieCode $Missie $script:Sleutel
    Write-Host 'Alles goed! ' -ForegroundColor Green -NoNewline
    Write-Host "Je code voor missie ${Missie}: $code"
    Write-Host 'Typ de code in het spel.'
    exit 0
}
if ($script:Fouten -eq 1) {
    Write-Host 'Nog 1 punt te gaan. Los het op en draai het script opnieuw.'
} else {
    Write-Host "Nog $($script:Fouten) punten te gaan. Los ze op en draai het script opnieuw."
}
exit 1
