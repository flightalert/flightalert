import { Aircraft } from '@/models/aircraft';
import axios from 'axios';
import Template from './Template';

class NotificationManager {
    public templates: Record<string, Template> = {};

    public addTemplate(name: string, filePath: string): Template {
        this.templates[name] = (new Template(name, filePath)).compile();
        return this.templates[name];
    }

    public getTemplate(name: string) {
        const template = this.templates?.[name];
        if(!template) {
            throw new Error('No template found: ' + name);
        }
        return template;
    }

    public async notify(aircraft: Aircraft): Promise<boolean> {
        const titleTemplate = this.getTemplate('title');
        const renderedTitleTemplate = titleTemplate.render({env: process.env.APP_ENV, flight: aircraft.toJson(true)});
        if(!renderedTitleTemplate) {
            throw new Error('Issue rendering title template for notification.');
        }

        const bodyTemplate = this.getTemplate('body');
        const renderedBodyTemplate = bodyTemplate.render({flight: aircraft.toJson(true)});
        if(!renderedBodyTemplate) {
            throw new Error('Issue rendering body template for notification.');
        }

        try {
            const data: Record<string, any> = {
                urls: process.env.APPRISE_NOTIFY_URLS,
                title: renderedTitleTemplate.trim(),
                body: renderedBodyTemplate.trim(),
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
