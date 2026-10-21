# --- Configuración ---
$IMAGE_NAME = 'cosmos-back'
$SshUser = "marcostor13"
$Ec2Host = "192.168.100.29"
$RemoteProjectPath = "/home/$SshUser"
$RemoteScriptPath = "./deploy.sh"
$ImageName = "marcostor13/$IMAGE_NAME"
$ContainerName = "cosmos-back"
$HostPort = "3023"
$enviromentsFile = ".env_cosmos"

# --- Build & Push ---
Write-Host "BUILDING IMAGE LOCALLY"
docker build -t $IMAGE_NAME .

Write-Host "TAGGING IMAGE"
docker tag $IMAGE_NAME $ImageName

Write-Host "PUSHING IMAGE TO DOCKER HUB"
docker push $ImageName

# --- Deploy remoto ---
Write-Host "Conectando a $SshUser@$Ec2Host y ejecutando script remoto..."
$RemoteCommand = "cd $RemoteProjectPath && $RemoteScriptPath '$ImageName' '$ContainerName' '$HostPort' '$enviromentsFile'"

$SshCommandArgs = @(
    "$SshUser@$Ec2Host",
    $RemoteCommand
)
Write-Host "Comando SSH: ssh $SshUser@$Ec2Host `"$RemoteCommand`""

& ssh $SshCommandArgs

if ($LASTEXITCODE -eq 0) {
    Write-Host "Script remoto ejecutado exitosamente."
} else {
    Write-Error "El comando SSH o el script remoto fallaron con código: $LASTEXITCODE"
    exit 1
}

Write-Host "--- Script Finalizado ---"
