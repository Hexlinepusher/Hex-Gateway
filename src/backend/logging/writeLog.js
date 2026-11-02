export default function writeLog(level, event, details = {}, output = process.stdout) {
  output.write(
    JSON.stringify({ timestamp: new Date().toISOString(), level, event, details }) + '\n'
  );
}
