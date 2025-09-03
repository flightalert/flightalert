import fs from 'fs';
import ejs, { TemplateFunction } from 'ejs';
import Logger from '../logger';
import { Aircraft } from '@/models/aircraft';
import axios from 'axios';

class NotificationManager {
    public template: TemplateFunction|null = null;

    public compileTemplate(path: string) {
        const template = fs.readFileSync(path, 'utf8');
        const compiled = ejs.compile(template);
        this.template = compiled;
    }

    public render(data: Record<string, any>) :string|null {
        if(!this.template) {
            Logger.error('No template for rendering notification.')
            return null;
        }

        return this.template(data);
    }

    public async notify(aircraft: Aircraft): Promise<boolean> {
        const renderedTemplate = this.render({flight: aircraft.toJson(true)});
        if(!renderedTemplate) {
            Logger.error('Issue rendering template for notification.');
            return false;
        }

        try {
            const data: Record<string, any> = {
                urls: process.env.APPRISE_NOTIFY_URLS,
                title: (process.env.APP_ENV === 'development' ? 'Local ' : '') + 'Flight',
                body: renderedTemplate.trim(),
                type: 'info',
            };

            await axios.post(
                process.env.APPRISE_API_URL,
                data,
                {
                    'headers': {
                        'Content-Type': 'application/json'
                    }
                }
            );

            return true;
        } catch (e: any) {
            throw e;
        }
    }
}

export default new NotificationManager();
