/* Public OAuth PKCE app configuration. No Spotify client secret is used or exposed.
 * Server's SPOTIFY_CLIENT_ID must be set and its HTTPS redirect registered:
 * https://pulso-fit-ai-95-online.onrender.com/
 */
import {Server} from "node:http";
import {basename} from "node:path";

export const SPOTIFY_REDIRECT_URI="https://pulso-fit-ai-95-online.onrender.com/";
export function publicSpotifyConfig(clientId=process.env.SPOTIFY_CLIENT_ID){
 const id=String(clientId||"").trim();
 const enabled=/^[a-fA-F0-9]{32}$/.test(id);
 return {enabled,clientId:enabled?id:null,redirectUri:SPOTIFY_REDIRECT_URI,
  scope:"playlist-read-private playlist-read-collaborative",flow:"authorization_code_pkce"};
}
if(basename(process.argv[1]||"")==="server.mjs"&&!globalThis.__PULSO_SPOTIFY_CONFIG__){
 globalThis.__PULSO_SPOTIFY_CONFIG__=true;
 const upstream=Server.prototype.emit;
 Server.prototype.emit=function(event,...args){
  if(event!=="request"||args.length<2)return upstream.call(this,event,...args);
  const [req,res]=args;
  let path="";try{path=new URL(req.url,"http://localhost").pathname}catch{}
  if(path!=="/api/music/spotify/config")return upstream.call(this,event,...args);
  if(req.method!=="GET"){
   res.writeHead(405,{"Content-Type":"application/json","Cache-Control":"no-store","Allow":"GET"});
   res.end(JSON.stringify({error:"Method not allowed"}));return true;
  }
  res.writeHead(200,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
  res.end(JSON.stringify(publicSpotifyConfig()));
  return true;
 };
 console.log("[pulso-spotify] Public PKCE config endpoint mounted; enabled="+publicSpotifyConfig().enabled);
}