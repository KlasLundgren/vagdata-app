import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import proj4 from 'proj4';
import { getNärmasteVäg } from './services/trafikverketApi';
import './App.css';

// Definiera projektioner för konvertering
const wgs84 = "+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs";
const sweref99tm = "+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +axis=neu";

function App() {
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const markerRef = useRef(null);
  const roadPointMarkerRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [roadLinkData, setRoadLinkData] = useState(null);
  const [coords, setCoords] = useState(null);
  const [showDebug, setShowDebug] = useState(false);
  const [rawApiResponse, setRawApiResponse] = useState(null);

  // Växla debug-panelen
  const toggleDebug = () => {
    setShowDebug(prev => !prev);
  };

  useEffect(() => {
    // Kontrollera om kartan redan är initierad
    if (leafletMapRef.current) {
      return;
    }

    if (!window.L) {
      console.error("Leaflet is not loaded!");
      return;
    }

    // Skapa karta direkt med Leaflet (inte react-leaflet)
    const map = window.L.map(mapRef.current, {
      minZoom: 5,
      maxZoom: 18,
      zoomControl: true,
      attributionControl: true,
      center: [62.5, 16.5],
      zoom: 5
    });
    
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Spara kartreferensen
    leafletMapRef.current = map;

    // Hantera klick på kartan
    map.on('click', async function(e) {
      try {
        const { lat, lng } = e.latlng;
        
        // Konvertera till SWEREF99TM
        const [eastingSWEREF, northingSWEREF] = proj4(wgs84, sweref99tm, [lng, lat]);
        
        // Spara koordinater för visning
        setCoords({
          wgs84: { lat, lng },
          sweref99tm: { easting: eastingSWEREF, northing: northingSWEREF }
        });
        
        // Visa laddningsindikator
        setLoading(true);
        setError(null);
        
        // Ta bort tidigare markör om den finns
        if (markerRef.current) {
          map.removeLayer(markerRef.current);
        }
        
        if (roadPointMarkerRef.current) {
          map.removeLayer(roadPointMarkerRef.current);
        }
        
        // Lägg till grundläggande markör utan popup
        markerRef.current = window.L.marker([lat, lng]).addTo(map);
        
        // Rensa tidigare data
        setRoadLinkData(null);
        
        try {
          // Hämta vägdata från API:et med nätanknytningsfunktionen
          console.log(`Söker vägdata runt koordinat: ${eastingSWEREF}, ${northingSWEREF}`);
          
          const vägdata = await getNärmasteVäg(eastingSWEREF, northingSWEREF);
          setRoadLinkData(vägdata);
          setRawApiResponse(vägdata.rawResponse);
          console.log("Satte vägnätdata:", vägdata);
          
          // Om vi har en nätanknytningspunkt, visa den också
          if (vägdata?.evalResults && vägdata.evalResults['Närmaste länk']) {
            try {
              const linkPoint = vägdata.evalResults['Närmaste länk'].Geometry;
              // Extrahera koordinaterna från POINT (xxx.xx yyy.yy)
              const match = linkPoint.match(/POINT \(([0-9.]+) ([0-9.]+)\)/);
              if (match && match.length === 3) {
                const roadX = parseFloat(match[1]);
                const roadY = parseFloat(match[2]);
                
                // Konvertera SWEREF99TM till WGS84 för att visa på kartan
                const [roadLng, roadLat] = proj4(sweref99tm, wgs84, [roadX, roadY]);
                
                // Skapa en road marker med annan färg
                roadPointMarkerRef.current = window.L.circleMarker([roadLat, roadLng], {
                  radius: 8,
                  fillColor: '#3388ff',
                  color: '#fff',
                  weight: 2,
                  opacity: 1,
                  fillOpacity: 0.8
                }).addTo(map);
              }
            } catch (err) {
              console.error('Kunde inte visa nätanknytningspunkt:', err);
            }
          }
        } catch (apiError) {
          console.error('Fel vid API-anrop:', apiError);
          setError('Kunde inte hämta vägdata: ' + apiError.message);
        }
      } catch (err) {
        console.error('Fel vid klickhantering:', err);
        setError('Ett fel uppstod: ' + err.message);
        
        // Säkerställ att koordinatpanelen alltid uppdateras om koordinaterna kunde extraheras
        if (e && e.latlng) {
          const { lat, lng } = e.latlng;
          try {
            const [easting, northing] = proj4(wgs84, sweref99tm, [lng, lat]);
            setCoords({
              wgs84: { lat, lng },
              sweref99tm: { easting, northing }
            });
          } catch (projError) {
            console.error('Kunde inte konvertera koordinater:', projError);
          }
        }
      } finally {
        setLoading(false);
      }
    });

    // Städa upp när komponenten avmonteras
    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  // Funktion för att rendera en informationssektion i sidopanelen
  const renderInfoSection = (title, content) => {
    if (!content) return null;
    return (
      <div className="info-section">
        <h3>{title}</h3>
        {content}
      </div>
    );
  };

  // Funktion för att säkert kolla om en array har innehåll
  const hasData = (array) => {
    return Array.isArray(array) && array.length > 0;
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Vägdata Sverige</h1>
        <div className="api-controls">
          <button 
            onClick={toggleDebug}
            className={`debug-btn ${showDebug ? 'active' : ''}`}
          >
            {showDebug ? 'Dölj API-detaljer' : 'Visa API-detaljer'}
          </button>
        </div>
        {loading && <div className="loading-indicator">Hämtar vägdata...</div>}
        {error && <div className="error-message">{error}</div>}
      </header>
      
      <div 
        ref={mapRef} 
        className="map-container"
      ></div>

      {/* Enhetlig sidopanel för vägdata */}
      {(coords || roadLinkData) && (
        <div className="side-panel">
          <h2>Vägdata information</h2>
          
          {/* Koordinatsektion */}
          {coords && renderInfoSection("Koordinater", (
            <div>
              <h4>WGS84:</h4>
              <p>{coords.wgs84.lat.toFixed(6)}, {coords.wgs84.lng.toFixed(6)}</p>
              <h4>SWEREF99TM:</h4>
              <p>E: {coords.sweref99tm.easting.toFixed(2)}<br />N: {coords.sweref99tm.northing.toFixed(2)}</p>
            </div>
          ))}

          {/* Nätanknytningsresultat */}
          {roadLinkData?.evalResults && renderInfoSection("Nätanknytningsresultat", (
            <div>
              {roadLinkData.evalResults['Närmaste länk'] && (
                <div className="data-item">
                  <h4>Närmaste länk</h4>
                  <p><strong>Element ID:</strong> {roadLinkData.evalResults['Närmaste länk'].Element_Id}</p>
                  <p><strong>Offset:</strong> {parseFloat(roadLinkData.evalResults['Närmaste länk'].Offset).toFixed(4)}</p>
                </div>
              )}
            </div>
          ))}

          {/* Vägnummerdata */}
          {hasData(roadLinkData?.data) && renderInfoSection("Vägnummerdata", (
            <ul className="data-list">
              {roadLinkData.data.map((väg, index) => (
                <li key={`vägnr-${index}`} className="data-item">
                  {väg.Huvudnummer && <p><strong>Vägnummer:</strong> {väg.Huvudnummer}</p>}
                  {väg.Europavägsnummer && <p><strong>Europaväg:</strong> {väg.Europavägsnummer}</p>}
                  {väg.Vägkategori && <p><strong>Kategori:</strong> {väg.Vägkategori}</p>}
                  {väg.GID && <p><strong>GID:</strong> {väg.GID}</p>}
                </li>
              ))}
            </ul>
          ))}

          {/* Gatunamn */}
          {hasData(roadLinkData?.gatuNamnDetails?.data) && renderInfoSection("Gatunamn", (
            <ul className="data-list">
              {roadLinkData.gatuNamnDetails.data.map((gata, index) => (
                <li key={`gata-${index}`} className="data-item">
                  {gata.Namn && <p><strong>Namn:</strong> {gata.Namn}</p>}
                  {gata.GID && <p><strong>GID:</strong> {gata.GID}</p>}
                </li>
              ))}
            </ul>
          ))}

          {/* Funktionell Vägklass */}
          {hasData(roadLinkData?.funktionellVägklassDetails?.data) && renderInfoSection("Funktionell Vägklass", (
            <ul className="data-list">
              {roadLinkData.funktionellVägklassDetails.data.map((vägklass, index) => (
                <li key={`vägklass-${index}`} className="data-item">
                  {vägklass.Klass && <p><strong>Klass:</strong> {vägklass.Klass}</p>}
                  {vägklass.GID && <p><strong>GID:</strong> {vägklass.GID}</p>}
                </li>
              ))}
            </ul>
          ))}

          {/* Hastighetsbegränsning */}
          {hasData(roadLinkData?.hastighetDetails?.data) && renderInfoSection("Hastighetsbegränsning", (
            <ul className="data-list">
              {roadLinkData.hastighetDetails.data.map((hastighet, index) => (
                <li key={`hastighet-${index}`} className="data-item">
                  {hastighet.Högsta_tillåtna_hastighet && <p><strong>Hastighet:</strong> {hastighet.Högsta_tillåtna_hastighet} km/h</p>}
                  {hastighet.GID && <p><strong>GID:</strong> {hastighet.GID}</p>}
                </li>
              ))}
            </ul>
          ))}

          {/* Väghållare */}
          {hasData(roadLinkData?.väghållareDetails?.data) && renderInfoSection("Väghållare", (
            <ul className="data-list">
              {roadLinkData.väghållareDetails.data.map((väghållare, index) => (
                <li key={`väghållare-${index}`} className="data-item">
                  {väghållare.Väghållartyp && <p><strong>Typ:</strong> {väghållare.Väghållartyp}</p>}
                  {väghållare.Väghållarnamn && <p><strong>Namn:</strong> {väghållare.Väghållarnamn}</p>}
                  {väghållare.GID && <p><strong>GID:</strong> {väghållare.GID}</p>}
                </li>
              ))}
            </ul>
          ))}

          {/* Vägbredd */}
          {hasData(roadLinkData?.vägbreddDetails?.data) && renderInfoSection("Vägbredd", (
            <ul className="data-list">
              {roadLinkData.vägbreddDetails.data.map((bredd, index) => (
                <li key={`bredd-${index}`} className="data-item">
                  {bredd.Bredd && <p><strong>Bredd:</strong> {bredd.Bredd} meter</p>}
                  {bredd.GID && <p><strong>GID:</strong> {bredd.GID}</p>}
                </li>
              ))}
            </ul>
          ))}

          {/* API-status/debug-information */}
          <div className="api-status">
            {roadLinkData?.message && <p className="status-message">{roadLinkData.message}</p>}
            {roadLinkData?.error && <p className="error-message">Fel: {roadLinkData.error}</p>}
          </div>
        </div>
      )}
      
      {/* Debug-panel för att visa råa API-svaret */}
      {showDebug && rawApiResponse && (
        <div className="debug-panel">
          <h2>API Debug Info</h2>
          <div className="debug-content">
            <pre>{JSON.stringify(rawApiResponse, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;