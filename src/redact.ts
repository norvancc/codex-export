const SECRET_VALUE = "********************************";

const SECRET_KEY_RE = /(api[_-]?key|secret|token|password|passwd|pwd|credential|private[_-]?key|dsn|auth)/i;

export function redactSecrets(input: string): string {
  let output = input;

  output = output.replace(/\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{16,}\b/g, `sk-${SECRET_VALUE}`);
  output = output.replace(/\bsk-ant-[A-Za-z0-9_-]{16,}\b/g, `sk-ant-${SECRET_VALUE}`);
  output = output.replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, `AKIA${SECRET_VALUE}`);
  output = output.replace(/\baws_secret_access_key\s*=\s*[A-Za-z0-9/+]{32,}/gi, `aws_secret_access_key=${SECRET_VALUE}`);
  output = output.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, `Bearer ${SECRET_VALUE}`);
  output = output.replace(/(Authorization\s*:\s*)(?:Bearer|Basic|Token)?\s*[A-Za-z0-9._~+/=-]{8,}/gi, `$1${SECRET_VALUE}`);
  output = output.replace(/(["']?authorization["']?\s*:\s*["'])(?:Bearer|Basic|Token)?\s*[^"']+(["'])/gi, `$1${SECRET_VALUE}$2`);

  output = output
    .split("\n")
    .map((line) => redactEnvLine(line))
    .join("\n");

  return output;
}

function redactEnvLine(line: string): string {
  const envMatch = line.match(/^(\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)(?:\s*=\s*|\s*:\s*))(.+?)\s*$/i);
  if (envMatch && SECRET_KEY_RE.test(envMatch[2])) {
    return `${envMatch[1]}${SECRET_VALUE}`;
  }

  const jsonMatch = line.match(/^(\s*["']?([^"':=]+)["']?\s*:\s*["'])(.*?)(["'],?\s*)$/);
  if (jsonMatch && SECRET_KEY_RE.test(jsonMatch[2])) {
    return `${jsonMatch[1]}${SECRET_VALUE}${jsonMatch[4]}`;
  }

  return line;
}
