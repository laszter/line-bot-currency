import { WebhookEvent, Client, middleware } from '@line/bot-sdk';
import express, { Express, Request, Response } from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config();
const app = express();

const mongoDBClient = new MongoClient(process.env.MONGODBURI || '');

const lineConfig = {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
    channelSecret: process.env.LINE_CHANNEL_SECRET_TOKEN || ''
};

const client = new Client(lineConfig);

app.post('/webhook', middleware(lineConfig), async (req, res) => {
    try {
        const events = req.body.events as WebhookEvent[]
        return events.length > 0 ? await events.map((item: WebhookEvent) => handleEvent(item)) : res.status(200).send('OK')
    }
    catch (err) {
        res.status(500).end()
    }
})

const handleEvent = async (event: WebhookEvent) => {
    if (event.type !== 'message' || event.message.type !== 'text') {
        return
    }

    const message = event.message.text;
    if (message.toLocaleLowerCase().startsWith('currency')) {
        const currency = message.toLocaleLowerCase().replace('currency', '').trim().toUpperCase();

        mongoDBClient.db('ratebotDB').collection('config').findOne({ userId: event.source.userId }).then((res: any) => {
            if (res) {
                mongoDBClient.db('ratebotDB').collection('config').updateOne({ userId: event.source.userId }, { $set: { "config.currency": currency } });
            }
            else {
                mongoDBClient.db('ratebotDB').collection('config').insertOne({ userId: event.source.userId, config: { currency: currency } });
            }
        }).catch((err: any) => {
            console.log(err);
        });

        client.replyMessage(event.replyToken, {
            type: 'text',
            text: `Change currency to ${currency} success!`
        });
    }
    else if (message.toLocaleLowerCase().startsWith('vat')) {
        const vat = message.toLocaleLowerCase().replace('vat', '').trim();

        mongoDBClient.db('ratebotDB').collection('config').findOne({ userId: event.source.userId }).then((res: any) => {
            if (res) {
                mongoDBClient.db('ratebotDB').collection('config').updateOne({ userId: event.source.userId }, { $set: { "config.vat": vat } });
            }
            else {
                mongoDBClient.db('ratebotDB').collection('config').insertOne({ userId: event.source.userId, config: { vat: vat } });
            }
        }).catch((err: any) => {
            console.log(err);
        });

        client.replyMessage(event.replyToken, {
            type: 'text',
            text: `Change VAT to ${vat} success!`
        });
    }
    else if (message.toLocaleLowerCase().startsWith('reverse')) {
        let reverse = true;

        mongoDBClient.db('ratebotDB').collection('config').findOne({ userId: event.source.userId }).then((res: any) => {
            if (res) {
                reverse = !res.config.reverse;
                mongoDBClient.db('ratebotDB').collection('config').updateOne({ userId: event.source.userId }, { $set: { "config.reverse": reverse } });
            }
            else {
                mongoDBClient.db('ratebotDB').collection('config').insertOne({ userId: event.source.userId, config: { reverse: reverse } });
            }
        }).catch((err: any) => {
            console.log(err);
        });

        client.replyMessage(event.replyToken, {
            type: 'text',
            text: `Change reverse to ${reverse} success!`
        });
    }
    else if (message.toLocaleLowerCase().startsWith('config')) {
        mongoDBClient.db('ratebotDB').collection('config').findOne({ userId: event.source.userId }).then((res: any) => {
            if (res) {
                client.replyMessage(event.replyToken, {
                    type: 'text',
                    text: `Currency: ${res.config.currency}\nVAT: ${res.config.vat}\nReverse: ${res.config.reverse}`
                });
            }
            else {
                client.replyMessage(event.replyToken, {
                    type: 'text',
                    text: 'Please config your currency first!'
                });
            }
        }).catch((err: any) => {
            console.log(err);
        });
    }
    else if (message.toLocaleLowerCase().startsWith('help')) {
        client.replyMessage(event.replyToken, {
            type: 'text',
            text: 'Command list\n1. currency [currency code]\n2. vat [vat]\n3. reverse\n4. config\n5. help'
        });
    }
    else if (parseFloat(message.replace(/,/g, '')) >= 0) {
        axios.get('https://www.superrichthailand.com/api/v1/rates', {
            auth: {
                username: 'superrichTh',
                password: 'hThcirrepus'
            }
        }).then((res: any) => {
            const exchangeRate = res.data.data.exchangeRate || [];
            mongoDBClient.db('ratebotDB').collection('config').findOne({ userId: event.source.userId }).then(async (res: any) => {
                if (res) {
                    const data = await exchangeRate.find((item: any) => { return item.cUnit === res.config.currency; });
                    let rate = parseFloat(data.rate[0].cBuying);
                    let result = parseFloat(message.replace(/,/g, '')) * rate;
                    if(res.config.reverse) {
                        rate = parseFloat(data.rate[0].cSelling);
                        result = parseFloat(message.replace(/,/g, '')) / rate;
                    }
                    client.replyMessage(event.replyToken, {
                        type: 'text',
                        text: `${res.config.reverse ? 'BTH to ' + data.cUnit : data.cUnit + ' to BTH'}\nExchange rate: ${rate}\nResult: ${addCommasToNumber(result.toFixed(2))}\nInclude VAT ${(res.config.vat || 0)}%: ${addCommasToNumber((result * ((100.0 + parseFloat(res.config.vat || 0)) / 100.0)).toFixed(2))}`
                    });
                }
                else {
                    client.replyMessage(event.replyToken, {
                        type: 'text',
                        text: 'Please config your currency first!'
                    });
                }
            }).catch((err: any) => {
                console.log(err);
            });
        }).catch((err: any) => {
            console.log(err);
        });
    }
}

function addCommasToNumber(number : number | string) {
    // Convert the number to a string
    let strNumber = number.toString();
    
    // Split the string into integer and fractional parts
    let parts = strNumber.split('.');
    
    // Format the integer part with commas
    let integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    
    // If there is a fractional part, combine it with the formatted integer part
    let formattedNumber = integerPart;
    if (parts.length > 1) {
      formattedNumber += '.' + parts[1];
    }
    
    // Return the formatted number
    return formattedNumber;
  }
  

let port = process.env.PORT
app.listen(port, () => {
    console.log(`app listen on port ${port}`)
})
