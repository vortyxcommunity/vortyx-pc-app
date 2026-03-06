import pngToIco from 'png-to-ico';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputPath = path.join(__dirname, '../src/assets/vortyx-logo.png');
const outputPath = path.join(__dirname, '../public/vortyx-logo.ico');

pngToIco(inputPath)
    .then(buf => {
        fs.writeFileSync(outputPath, buf);
        console.log('Successfully generated vortyx-logo.ico');
    })
    .catch(err => {
        console.error('Error generating ico:', err);
    });
