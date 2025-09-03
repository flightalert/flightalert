import * as airports from './static/airports.json' with { type: "json" };
import * as states from './static/states.json' with { type: "json" };

export const getState = (state: string) => {
    /* @ts-ignore */
    return states.default.name[state];
}

// let airports = [];
export const getAirportInfo = async (code: string) => {
    // if(airports.length === 0) {
        // const airportsFile = fs.readFileSync('airports.csv', 'utf8');
        // const result = Papa.parse(airportsFile, {
        //     header: true
        // });
        // airports = result.data;
    // }

    // return airports.find((airport) => {
    //     return airport.code == code;
    // });

    /* @ts-ignore */
    return airports.default[code];
}
