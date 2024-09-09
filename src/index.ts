import { Elysia } from "elysia";
import { AtpAgent, RichText } from '@atproto/api'; 
import https from 'https';
import http from 'http';
import 'dotenv/config';

const BSKY_AGENT_URL = 'https://bsky.social';

const app = new Elysia();
const agent = new AtpAgent({ service: BSKY_AGENT_URL });

app.get("/", () => {
  return "OK";
});

app.post("/", async ({ body }) => {
  try {
    const title = (body as any).page.title;
    const url = (body as any).page.originalUrl;
    const description = (body as any).page.description;
    const thumbnail = (body as any).page.thumbnail;

    const texts = [
      "📌 New bookmark!\n",
      `${title}\n`,
      `${description}\n`,
      url,
    ].join('\n');
    
    const formatedText = [
      "📌 New bookmark!\n",
      `${title}\n`,
      url,
    ].join('\n');

    const rt = new RichText({
      text: texts.length > 300 ? formatedText : texts,
    });

    await rt.detectFacets(agent);

    const getEmbed = async () => {
      try {
        const thumbnailData = await imageUrlToBase64(thumbnail);
        const { data } = await agent.uploadBlob(convertDataURIToUint8Array(thumbnailData as string), {
          encoding: 'image/png',
        });

        console.log(data);

        return {
          embed: {
            $type: "app.bsky.embed.external",
            external: {
              uri: url,
              title,
              description,
              thumb: data.blob,
            },
          },
        }
      } catch (e) {
        console.log(e);
        return {}
      }
    }

    const embedded = await getEmbed();

    await agent.post({
      ...embedded,
      text: rt.text,
      facets: rt.facets,
      createdAt: new Date().toISOString(),
    })
  } catch (e) {
    console.log(e);
  }
});

try {
  console.log({
    identifier: process.env.BSKY_USER as string,
    password: process.env.BSKY_PWD as string,
  })

  const isLoggedIn = await agent.login({
    identifier: process.env.BSKY_USER as string,
    password: process.env.BSKY_PWD as string,
  });

  if (!isLoggedIn.success) {
    throw new Error("Failed to login");
  }

  app.listen(3000, () => {
    console.log("listening on port 3000");
  });
} catch (e) {
  console.log(e);
}

function imageUrlToBase64(url) {
  return new Promise((resolve, reject) => {
    // Determine whether to use http or https based on the URL
    const client = url.startsWith('https') ? https : http;

    client.get(url, (response) => {
      // Check if the request was successful
      if (response.statusCode < 200 || response.statusCode > 299) {
        reject(new Error(`Failed to load image, status code: ${response.statusCode}`));
        return;
      }

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const base64Image = buffer.toString('base64');
        resolve(`data:${response.headers['content-type']};base64,${base64Image}`);
      });
    }).on('error', reject);
  });
}

function convertDataURIToUint8Array(dataURI: string): Uint8Array {
  const blob = dataURI.split(',')[1];
  const byteString = atob(blob);
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const intArray = new Uint8Array(arrayBuffer);
  for (let i = 0; i < byteString.length; i++) {
    intArray[i] = byteString.charCodeAt(i);
  }
  return intArray;
}