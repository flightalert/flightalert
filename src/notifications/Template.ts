import fs from 'fs';
import ejs, { TemplateFunction } from 'ejs';
import Logger from '../logger';

class Template {
    public name: string = '';
    public path: string = '';
    public template: TemplateFunction|null = null;

    constructor(name: string, path: string) {
        this.name = name;
        this.path = path;
    }

    public compile(): Template {
        const templateFile = fs.readFileSync(this.path, 'utf8');
        const compiled = ejs.compile(templateFile);
        this.template = compiled;
        return this;
    }

    public render(data: Record<string, any>):string|null {
        if(!this.template) {
            throw new Error('No template for rendering notification.')
        }

        return this.template(data);
    }
}

export default Template;
