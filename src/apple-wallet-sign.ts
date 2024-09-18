import { createWriteStream, promises } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { asn1, pki, pkcs7, util } from 'node-forge';
import * as archiver from 'archiver';

import { PKPass, PKBarcodeFormat, PKDateStyle, SupportedLocale } from './pk-pass';

const {
  PASSPHASE,
  PASS_TYPE_IDENTIFIER,
  TEAM_IDENTIFIER
} = process.env;

const basePath = join(__dirname, 'assets');

const createSignatureAsync = async (buffers: Record<string, Buffer>) => {
  const [manifest, wwdrPem, signerPem, passKey] = await Promise.all([
    buffers['manifest.json'],
    promises.readFile(join(basePath, 'WWDR.pem'), 'utf8'),
    promises.readFile(join(basePath, 'passcertificate.pem'), 'utf8'),
    promises.readFile(join(basePath, 'passkey.pem'), 'utf8')
  ]);

  const passphrase = PASSPHASE;

  const privateKey = pki.decryptRsaPrivateKey(passKey, passphrase);

  if (!privateKey) {
    throw new Error('Failed to decrypt private key. Check your password.');
  }

  const signerCert = pki.certificateFromPem(signerPem);
  const wwdrCert = pki.certificateFromPem(wwdrPem);

  const p7 = pkcs7.createSignedData();
  p7.content = new util.ByteStringBuffer(manifest);

  p7.addCertificate(wwdrCert);
  p7.addCertificate(signerCert);

  p7.addSigner({
    key: privateKey,
    certificate: signerCert,
    digestAlgorithm: pki.oids.sha1,
    authenticatedAttributes: [
      {
        type: pki.oids.contentType,
        value: pki.oids.data
      }, {
        type: pki.oids.messageDigest
      }, {
        type: pki.oids.signingTime
      }
    ]
  });

  p7.sign({ detached: true });

  // Convert to DER
  const derBuffer = Buffer.from(asn1.toDer(p7.toAsn1()).getBytes(), 'binary');

  buffers['signature'] = derBuffer;

  return buffers;
};

const getFileSha1Async = async (filePath: string | Buffer): Promise<string> => {
  if (typeof filePath === 'string') {
    const file = await promises.readFile(filePath);

    const sha1sum = createHash('sha1').update(file).digest("hex");

    return sha1sum;
  }

  return new Promise((resolve) => {
    const sha1sum = createHash('sha1').update(filePath).digest("hex");

    return resolve(sha1sum);
  });
};

const createManifestAsync = async (files: string[]) => {
  const outputFileBuffers: Record<string, Buffer> = {};
  const manifest: Record<string, string> = {};

  const pkPass = new PKPass({
    passTypeIdentifier: PASS_TYPE_IDENTIFIER,
    teamIdentifier: TEAM_IDENTIFIER,
    serialNumber: '0123456789101112',
    description: 'demo pass',
    organizationName: 'Demo Pass Organization'
  });

  pkPass.set('barcodes', [{
    format: PKBarcodeFormat.PKBarcodeFormatQR,
    message: '0123456789101112',
    messageEncoding: 'iso-8859-1',
    altText: '********89101112'
  }])
    .set('foregroundColor', 'rgb(234, 234, 234)')
    .set('backgroundColor', 'rgb(70, 70, 70)')
    .set('labelColor', 'rgb(234, 234, 234)')
    .set('generic', {
      primaryFields: [
        {
          label: pkPass.createTranslation({
            [SupportedLocale.EN]: 'Name'.toUpperCase(),
            [SupportedLocale.ZH_HANT]: '名稱',
          }),
          "key": "name",
          value: pkPass.createTranslation({
            [SupportedLocale.EN]: 'John Smith',
            [SupportedLocale.ZH_HANT]: '莊',
          })
        }
      ],
      secondaryFields: [
        {
          key: "number",
          label: pkPass.createTranslation({
            [SupportedLocale.EN]: 'Number'.toUpperCase(),
            [SupportedLocale.ZH_HANT]: '編號',
          }),
          value: 1234567
        },
        {
          key: "expires",
          label: pkPass.createTranslation({
            [SupportedLocale.EN]: 'Expires'.toUpperCase(),
            [SupportedLocale.ZH_HANT]: '到期日',
          }),
          value: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          dateStyle: PKDateStyle.Short,
          ignoresTimeZone: true
        }
      ],
      backFields: [
        {
          key: "terms",
          label: "Terms and Conditions",
          value: "O Fortuna velut luna statu variabilis, semper crescis aut decrescis; vita detestabilis nunc obdurat et tunc curat ludo mentis aciem, egestatem, potestatem dissolvit ut glaciem.\n\n Sors immanis et inanis, rota tu volubilis, status malus, vana salus semper dissolubilis, obumbrata et velata michi quoque niteris; nunc per ludum dorsum nudum fero tui sceleris.\n\n Sors salutis et virtutis michi nunc contraria, est affectus et defectus semper in angaria.  Hac in hora sine mora corde pulsum tangite; quod per sortem sternit fortem, mecum omnes plangite!"
        }
      ]
    });

  const { pass, translations } = pkPass.output();

  outputFileBuffers['pass.json'] = Buffer.from(JSON.stringify(pass), 'utf8');

  if (Object.keys(translations).length > 0) {
    const translationsRaw: Record<string, string> = {};
    // create translation files
    await Promise.all(Object.keys(translations).map(async (key) => {
      const path = `${key}/pass.strings`;

      translationsRaw[path] = translations[key].join('\n');
    }));

    Object.keys(translationsRaw).forEach((key) => {
      outputFileBuffers[key] = Buffer.from(translationsRaw[key], 'utf8');
    });
  }

  // convert files to buffers
  await Promise.all(files.map(async (file) => {
    outputFileBuffers[file] = await promises.readFile(join(basePath, file));
  }));

  await Promise.all(Object.keys(outputFileBuffers).map(async (key) => {
    const sha1 = await getFileSha1Async(outputFileBuffers[key]);

    manifest[key] = sha1;

    return sha1;
  }));

  outputFileBuffers['manifest.json'] = Buffer.from(JSON.stringify(manifest), 'utf8');

  return outputFileBuffers;
};

const createPkpassAsync = async (buffers: Record<string, Buffer>) => {
  const output = createWriteStream(join(basePath, 'demo-pass.pkpass'));

  const archive = archiver('zip');

  output.on('close', () => {
    console.log(archive.pointer() + ' total bytes');
    console.log('archiver has been finalized and the output file descriptor has closed.');
  });

  output.on('end', () => {
    console.log('Data has been drained');
  });

  archive.pipe(output);

  Object.keys(buffers).map((fileName) => {
    archive.append(buffers[fileName], { name: fileName });
  });

  archive.finalize();
};

const files = ['logo.png', 'logo@2x.png', 'icon.png', 'icon@2x.png', 'thumbnail.png', 'thumbnail@2x.png', 'background.png', 'background@2x.png',];

createManifestAsync(files)
  .then((buffers) => (createSignatureAsync(buffers)))
  .then((buffers) => (createPkpassAsync(buffers)));
