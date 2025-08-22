const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const certsDir = path.join(__dirname, '..', 'certs');

// Create certs directory if it doesn't exist
if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir);
}

// Generate self-signed certificate using OpenSSL
const command = `openssl req -x509 -newkey rsa:4096 -keyout ${path.join(certsDir, 'key.pem')} -out ${path.join(certsDir, 'cert.pem')} -days 365 -nodes -subj "/CN=localhost"`;

exec(command, (error, stdout, stderr) => {
    if (error) {
        console.error('Error generating certificates:', error);
        return;
    }
    console.log('SSL certificates generated successfully!');
    console.log('Location:', certsDir);
}); 