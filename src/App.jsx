import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import proj4 from 'proj4';
import { getVägdataFrånKoordinat, getNärmasteVäg } from './services/trafikverketApi';
import './App.css';

// Definiera projektioner för konvertering
const wgs84 = "+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs";
const sweref99tm = "+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +axis=neu";

function App() {
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const markerRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [roadData, setRoadData] = useState(null);
  const [roadLinkData, setRoadLinkData] = useState(null);
  const [coords, setCoords] = useState(null);
  const [apiMethod, setApiMethod] = useState('roadnet'); // 'roadnet' eller 'bbox'

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
        
        // Skapa eller uppdatera markör först, så den alltid visas oavsett API-resultat
        if (markerRef.current) {
          map.removeLayer(markerRef.current);
        }
        
        // Lägg till grundläggande markör utan vägdata
        markerRef.current = window.L.marker([lat, lng])
          .addTo(map)
          .bindPopup(`
            <div class="popup-content">
              <h3>Koordinater</h3>
              <p><strong>WGS84:</strong><br>${lat.toFixed(6)}, ${lng.toFixed(6)}</p>
              <p><strong>SWEREF99TM:</strong><br>E: ${eastingSWEREF.toFixed(2)}<br>N: ${northingSWEREF.toFixed(2)}</p>
              <hr>
              <h3>API-status</h3>
              <p>Hämtar vägdata...</p>
            </div>
          `)
          .openPopup();
        
        // Rensa tidigare data
        setRoadData(null);
        setRoadLinkData(null);
        
        try {
          // Hämta vägdata från API:et beroende på vald metod
          console.log(`Söker vägdata runt koordinat: ${eastingSWEREF}, ${northingSWEREF}`);
          
          if (apiMethod === 'roadnet') {
            // Använd nätanknytningsfunktionen
            const vägdata = await getNärmasteVäg(eastingSWEREF, northingSWEREF);
            setRoadLinkData(vägdata);
            console.log("Satte vägnätdata:", vägdata);
            
            // Uppdatera popup med API-resultat
            if (markerRef.current && vägdata) {
              markerRef.current.setPopupContent(`
                <div class="popup-content">
                  <h3>Koordinater</h3>
                  <p><strong>WGS84:</strong><br>${lat.toFixed(6)}, ${lng.toFixed(6)}</p>
                  <p><strong>SWEREF99TM:</strong><br>E: ${eastingSWEREF.toFixed(2)}<br>N: ${northingSWEREF.toFixed(2)}</p>
                  <hr>
                  <h3>API-status</h3>
                  <p>${vägdata?.success ? 'API-anrop lyckades' : 'API-anrop misslyckades'}</p>
                  <p>${vägdata?.message || (vägdata?.error ? `Fel: ${vägdata.error}` : '')}</p>
                </div>
              `);
            }
            
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
                  window.L.circleMarker([roadLat, roadLng], {
                    radius: 8,
                    fillColor: '#3388ff',
                    color: '#fff',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                  }).addTo(map).bindPopup('Närmaste vägpunkt');
                }
              } catch (err) {
                console.error('Kunde inte visa nätanknytningspunkt:', err);
              }
            }
          } else {
            // Använd box-sökning
            const vägdata = await getVägdataFrånKoordinat(eastingSWEREF, northingSWEREF);
            setRoadData(vägdata);
            console.log("Satte vägdata:", vägdata);
            
            // Uppdatera popup med API-resultat
            if (markerRef.current && vägdata) {
              markerRef.current.setPopupContent(`
                <div class="popup-content">
                  <h3>Koordinater</h3>
                  <p><strong>WGS84:</strong><br>${lat.toFixed(6)}, ${lng.toFixed(6)}</p>
                  <p><strong>SWEREF99TM:</strong><br>E: ${eastingSWEREF.toFixed(2)}<br>N: ${northingSWEREF.toFixed(2)}</p>
                  <hr>
                  <h3>API-status</h3>
                  <p>${vägdata?.success ? 'API-anrop lyckades' : 'API-anrop misslyckades'}</p>
                  <p>${vägdata?.message || (vägdata?.error ? `Fel: ${vägdata.error}` : '')}</p>
                </div>
              `);
            }
          }
        } catch (apiError) {
          console.error('Fel vid API-anrop:', apiError);
          setError('Kunde inte hämta vägdata: ' + apiError.message);
          
          // Uppdatera popup med felmeddelande
          if (markerRef.current) {
            markerRef.current.setPopupContent(`
              <div class="popup-content">
                <h3>Koordinater</h3>
                <p><strong>WGS84:</strong><br>${lat.toFixed(6)}, ${lng.toFixed(6)}</p>
                <p><strong>SWEREF99TM:</strong><br>E: ${eastingSWEREF.toFixed(2)}<br>N: ${northingSWEREF.toFixed(2)}</p>
                <hr>
                <h3>API-status</h3>
                <p>API-anrop misslyckades: ${apiError.message}</p>
              </div>
            `);
          }
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
  }, [apiMethod]);

  // Växla mellan API-metoder
  const toggleApiMethod = () => {
    setApiMethod(prev => prev === 'roadnet' ? 'bbox' : 'roadnet');
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Vägdata Sverige</h1>
        <div className="api-method-toggle">
          <button 
            onClick={toggleApiMethod} 
            className={`api-method-btn ${apiMethod === 'roadnet' ? 'active' : ''}`}
          >
            {apiMethod === 'roadnet' ? 'Använder: Nätnätknytning' : 'Använder: Område-sökning'}
          </button>
        </div>
        {loading && <div className="loading-indicator">Hämtar vägdata...</div>}
        {error && <div className="error-message">{error}</div>}
      </header>
      
      <div 
        ref={mapRef} 
        className="map-container"
      ></div>

      {coords && (
        <div className="coordinates-panel">
          <h3>Valda koordinater</h3>
          <p><strong>WGS84:</strong><br />{coords.wgs84.lat.toFixed(6)}, {coords.wgs84.lng.toFixed(6)}</p>
          <p><strong>SWEREF99TM:</strong><br />E: {coords.sweref99tm.easting.toFixed(2)}<br />N: {coords.sweref99tm.northing.toFixed(2)}</p>
        </div>
      )}

      {roadData && roadData.success && (
        <div className="road-info-panel">
          <h2>Vägdata (Område-sökning)</h2>
          {roadData.data && roadData.data.length > 0 ? (
            <ul>
              {roadData.data.map((väg, index) => (
                <li key={index}>
                  {väg.Huvudnummer && <div><strong>Vägnummer:</strong> {väg.Huvudnummer}</div>}
                  {väg.Europavägsnummer && <div><strong>Europaväg:</strong> {väg.Europavägsnummer}</div>}
                  {väg.Vägkategori && <div><strong>Kategori:</strong> {väg.Vägkategori}</div>}
                  {väg.Name && <div><strong>Namn:</strong> {väg.Name}</div>}
                </li>
              ))}
            </ul>
          ) : (
            <p>Inga vägar hittades inom 500 meter från den valda punkten.</p>
          )}
          
          <div className="api-debug">
            <p className="api-message">{roadData.message}</p>
            {roadData.error && <p className="api-error">Fel: {roadData.error}</p>}
          </div>
        </div>
      )}

      {roadLinkData && roadLinkData.success && (
        <div className="road-info-panel">
          <h2>Vägdata (Nätanknytning)</h2>
          
          {roadLinkData.evalResults && (
            <div className="road-link-section">
              <h3>Nätanknytningsresultat</h3>
              
              {roadLinkData.evalResults['Närmaste länk'] && (
                <div className="road-link-item">
                  <h4>Närmaste länk</h4>
                  <p><strong>Element ID:</strong> {roadLinkData.evalResults['Närmaste länk'].Element_Id}</p>
                  <p><strong>Offset:</strong> {parseFloat(roadLinkData.evalResults['Närmaste länk'].Offset).toFixed(4)}</p>
                  <p><strong>Geometri:</strong> {roadLinkData.evalResults['Närmaste länk'].Geometry}</p>
                </div>
              )}
              
              {roadLinkData.evalResults['Knyter mot vägnummer'] && (
                <div className="road-link-item">
                  <h4>Knyter mot vägnummer</h4>
                  <p><strong>Element ID:</strong> {roadLinkData.evalResults['Knyter mot vägnummer'].Element_Id}</p>
                  <p><strong>Offset:</strong> {parseFloat(roadLinkData.evalResults['Knyter mot vägnummer'].Offset).toFixed(4)}</p>
                  <p><strong>Geometri:</strong> {roadLinkData.evalResults['Knyter mot vägnummer'].Geometry}</p>
                </div>
              )}
            </div>
          )}
          
          {roadLinkData.data && roadLinkData.data.length > 0 ? (
            <div className="road-data-section">
              <h3>Vägdata</h3>
              <ul>
                {roadLinkData.data.map((väg, index) => (
                  <li key={index}>
                    {väg.Huvudnummer && <div><strong>Vägnummer:</strong> {väg.Huvudnummer}</div>}
                    {väg.Europavägsnummer && <div><strong>Europaväg:</strong> {väg.Europavägsnummer}</div>}
                    {väg.Vägkategori && <div><strong>Kategori:</strong> {väg.Vägkategori}</div>}
                    {väg.GID && <div><strong>GID:</strong> {väg.GID}</div>}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p>Inga vägdata hittades i sökresultatet.</p>
          )}
          
          <div className="api-debug">
            <p className="api-message">{roadLinkData.message}</p>
            {roadLinkData.error && <p className="api-error">Fel: {roadLinkData.error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;