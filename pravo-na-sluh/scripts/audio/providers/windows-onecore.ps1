# Локальный синтез речи через Windows OneCore (Windows.Media.SpeechSynthesis).
# Используется ТОЛЬКО для технической бета-озвучки и тестов: голоса Windows не предназначены
# для коммерческого распространения аудио. Для продакшна — SpeechKit/SaluteSpeech или диктор.
#
# Вход: JSON-файл задания [{ "id": "...", "ssml": "<speak ...>", "out": "C:\\...\\file.wav" }]
# Параметры: -JobFile <path> -Voice <часть имени голоса> [-ListVoices]
param(
  [string]$JobFile,
  [string]$Voice = "Pavel",
  [switch]$ListVoices
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]

function Await($op, [Type]$resultType) {
  $task = $asTaskGeneric.MakeGenericMethod($resultType).Invoke($null, @($op))
  $null = $task.Wait(-1)
  return $task.Result
}

$all = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices
if ($ListVoices) {
  $all | ForEach-Object { "{0}`t{1}`t{2}" -f $_.DisplayName, $_.Language, $_.Gender }
  exit 0
}

$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$selected = $all | Where-Object { $_.DisplayName -like "*$Voice*" -and $_.Language -eq "ru-RU" } | Select-Object -First 1
if (-not $selected) { throw "Голос '$Voice' (ru-RU) не найден" }
$synth.Voice = $selected

$jobs = Get-Content -Raw -Encoding UTF8 $JobFile | ConvertFrom-Json
$i = 0
foreach ($job in $jobs) {
  $i++
  $stream = Await ($synth.SynthesizeSsmlToStreamAsync($job.ssml)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  $size = [uint32]$stream.Size
  $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
  $null = Await ($reader.LoadAsync($size)) ([uint32])
  $bytes = New-Object byte[] $size
  $reader.ReadBytes($bytes)
  [System.IO.File]::WriteAllBytes($job.out, $bytes)
  $reader.Dispose(); $stream.Dispose()
  Write-Output ("OK`t{0}`t{1}" -f $job.id, $size)
}
