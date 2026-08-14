declare module 'web-push' {
  const webPush: any;
  export default webPush;
  export function generateVAPIDKeys(): { publicKey: string; privateKey: string };
  export function setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  export function sendNotification(subscription: any, payload?: any, options?: any): Promise<any>;
}

declare module 'express-mongo-sanitize' {
  import { RequestHandler } from 'express';
  function mongoSanitize(options?: any): RequestHandler;
  export default mongoSanitize;
}

declare module 'xss-clean' {
  import { RequestHandler } from 'express';
  function xssClean(): RequestHandler;
  export default xssClean;
}
