export function formatSSHError(ip: string, rawError: string): string {
  const err = rawError.toLowerCase();

  if (err.includes('connection refused')) {
    return `Unable to connect to ${ip}. The remote machine may be offline or SSH is not enabled. Verify the device is powered on and connected to the network.`;
  }
  if (err.includes('connection timed out') || err.includes('connecttimeout')) {
    return `Connection to ${ip} timed out. The device may be unreachable. Check that the VPN IP is correct and the device is on the Apple network.`;
  }
  if (err.includes('no route to host')) {
    return `No route to ${ip}. The device is not reachable on the current network. Ensure both your machine and the target device are connected to Apple VPN.`;
  }
  if (err.includes('permission denied') || err.includes('authentication')) {
    return `SSH authentication failed for ${ip}. The configured credentials may be incorrect. Contact your administrator to verify SSH access credentials.`;
  }
  if (err.includes('host key verification')) {
    return `SSH host key verification failed for ${ip}. The device's identity could not be verified. This may indicate a network configuration change.`;
  }
  if (err.includes('sshpass') || err.includes('command not found')) {
    return `SSH utility (sshpass) is not installed on this machine. Run: brew install hudochenkov/sshpass/sshpass`;
  }
  if (err.includes('nodename nor servname')) {
    return `Unable to resolve ${ip}. The hostname or IP address is invalid. Please verify the VPN IP and try again.`;
  }
  if (err.includes('operation not permitted')) {
    return `Permission denied while executing the command. The portal may need elevated privileges. Try running the server with sudo.`;
  }
  if (err.includes('dseditgroup')) {
    return `Failed to modify user group membership on ${ip}. The user account may not exist on the target device, or directory services are unavailable.`;
  }
  if (err.includes('jamf')) {
    return `JAMF command failed on ${ip}. The JAMF agent may not be installed or the device is not enrolled in JAMF management.`;
  }

  return `An unexpected error occurred while connecting to ${ip}. Please verify the VPN IP is correct and the device is online. If the issue persists, contact your system administrator.`;
}
