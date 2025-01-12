const http = require('http');
const httpCasClient = require('http-cas-client');
const jose = require('jose');
const {readFileSync} = require('fs');
const cookie = require('cookie');
const timestamp = require('console-timestamp');


let port = 3009;
if (process.argv.length >= 3 && parseInt(process.argv[2])) {
    port = parseInt(process.argv[2]);
}
const now1 = new Date();
console.log(`Restarted ${timestamp('MM/DD hh:mm', now1)} ${port}`);

const {
    JWE,   // JSON Web Encryption (JWE)
    JWK,   // JSON Web Key (JWK)
    JWKS,  // JSON Web Key Set (JWKS)
    JWS,   // JSON Web Signature (JWS)
    JWT,   // JSON Web Token (JWT)
    errors // errors utilized by jose
} = jose

const serviceName = 'https://api.libretexts.org/cas-bridge';
// set up connection to the CAS server
const handler = httpCasClient({
    casServerUrlPrefix: 'https://sso.libretexts.org/cas',
    serverName: serviceName
});

const key = JWK.asKey(readFileSync('./JWT/cas-bridge'));


http.createServer(async (req, res) => {
    if (req.url.includes('public')) {
        res.writeHead(200, {
            'Content-Type': 'text/plain',
            'Cache-Control': 'public,  max-age=604800, immutable, must-revalidate, no-transform'
        });
        
        // serve pubkey for JWT verification
        return res.end(readFileSync('./JWT/cas-bridge.pub'));
    }
    
    if (!await handler(req, res)) {
        return res.end();
    }
    
    const {principal, ticket} = req;
    if (!principal)
        return res.end();
    
    //principal pruning
    delete principal?.attributes?.id_token
    delete principal?.attributes?.access_token
    delete principal?.attributes?.refresh_token
    delete principal?.attributes?.aio
    
    // create JWT cookie containing principal information
    const cookies = cookie.parse(req.headers.cookie);
    const redirect = cookies?.api_redirect?.replace(/#$/, '') || undefined;
    console.log(JSON.stringify(principal, null, 2));
    const payload = {
        educational: /(?<=.*?)@.*?\.edu/.test(principal?.user || principal?.attributes?.principalID),
        user: principal?.user,
        name: principal?.attributes.name || `${principal?.attributes?.firstName || principal?.attributes?.given_name} ${principal?.attributes?.family_name || principal?.attributes?.lastName}`,
        email: principal?.attributes?.principalID,
        redirect: redirect,
        attributes: principal?.attributes, //TODO: Disable for staging
    }
    const token = JWT.sign(payload, key, {
      issuer: serviceName,
      subject: payload.email,
      expiresIn: '6.5 days'
    });
    // console.log(payload, token);
    
    res.writeHead(redirect ? 302 : 200, {
        'Set-Cookie': [`overlayJWT=${token}; Domain=libretexts.org; secure; Max-Age=600000; SameSite=Lax`],
        'Content-Type': 'text/plain',
        'Location': redirect,
    });
    res.end(JSON.stringify(principal, null, 2));
}).listen(port);
