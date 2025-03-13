# Vägdata Sverige

En mobilanpassad webbapplikation för att visa vägdata från Trafikverkets API. Detta projekt låter användare interagera med en karta över Sverige och få koordinater enligt SWEREF99TM koordinatsystem när de klickar på kartan.

## Funktioner

- Interaktiv karta över Sverige
- Konvertering från WGS84 (lat/long) till SWEREF99TM-koordinater
- Mobilanpassad design
- Marker med popup som visar koordinatinformation

## Teknologier

- React
- Vite
- Leaflet / React-Leaflet
- Proj4js (för koordinatkonvertering)

## Installation

1. Klona detta repository:
   ```
   git clone https://github.com/ditt-användarnamn/vagdata-app.git
   cd vagdata-app
   ```

2. Installera beroenden:
   ```
   npm install
   ```

3. Starta utvecklingsservern:
   ```
   npm run dev
   ```

4. Öppna din webbläsare och gå till `http://localhost:5173`

## Användning

- Klicka på valfri plats på kartan för att se dess koordinater både i WGS84 och SWEREF99TM-format.
- Zooma in/ut med hjälp av +/- knapparna eller mushjulet.

## Framtida utveckling

- Integration med Trafikverkets API för att visa vägdata
- Användarautentisering för betalningsmodell per användare
- Sökfunktion för specifika vägar eller platser
- Offlinestöd via Progressive Web App (PWA) funktionalitet

## Licens

Detta projekt är licensierat under MIT-licensen - se LICENSE-filen för detaljer.