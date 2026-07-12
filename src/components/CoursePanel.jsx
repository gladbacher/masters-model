import { weatherAdjustment } from '../api/weather'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dayLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z')
  return `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()}`
}

export default function CoursePanel({ event, weather }) {
  const c = event.course
  return (
    <div className="course-panel">
      {c && (
        <div className="course-info">
          <div className="course-name">{c.name}</div>
          <div className="course-facts">
            {c.par && <span>Par {c.par}</span>}
            {c.yards && <span>{c.yards.toLocaleString()} yds</span>}
            {c.par3s > 0 && (
              <span>
                {c.par3s}×3 · {c.par4s}×4 · {c.par5s}×5
              </span>
            )}
            {event.hasCut && <span>cut: top {event.cutCount} + ties</span>}
            {event.defendingChampion && <span>holder: {event.defendingChampion}</span>}
          </div>
        </div>
      )}
      {weather?.tooFarOut && (
        <div className="weather-note">Forecast opens ~16 days before the event</div>
      )}
      {weather?.days?.length > 0 && (
        <div className="weather-days">
          {weather.days.map((d) => {
            const adj = weatherAdjustment(d)
            return (
              <div key={d.date} className={`weather-day ${adj >= 0.8 ? 'rough' : adj > 0 ? 'breezy' : ''}`}>
                <div className="wd-date">{dayLabel(d.date)}</div>
                <div className="wd-wind">
                  {d.windAvg}mph <span className="wd-gust">g{d.gustMax}</span>
                </div>
                <div className="wd-rest">
                  {d.rainMm > 0.2 ? `${d.rainMm}mm` : 'dry'} · {d.tempMin}–{d.tempMax}°
                </div>
                <div className="wd-adj">{adj > 0 ? `+${adj.toFixed(1)}/rd` : 'no adj'}</div>
              </div>
            )
          })}
          {weather.geo?.place && <div className="weather-src">{weather.geo.place} · Met Office / local model via Open-Meteo</div>}
        </div>
      )}
    </div>
  )
}
