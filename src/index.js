import botstrap from 'botstrap';
import pledge from './pledge';

export default function initialize() {
  const bot = botstrap({ token: process.env.TOKEN });
  bot.onMessage(pledge);
  bot.start();
}
