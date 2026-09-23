-- Campus coordinates, for the confession bubbles on the Community map.
-- Nullable: a campus without coordinates simply gets no bubble.
--
-- Seeded for all 34 UiTM campuses. Sources:
--   • 30 from OpenStreetMap (Nominatim): the campus polygon's centre
--     (amenity=university), except Bandaraya Melaka (its residential college)
--     and Selayang (Hospital UiTM Selayang, where that campus sits).
--   • 4 with no OSM campus polygon (Bukit Besi, Kota Samarahan, Samarahan 2,
--     Sungai Petani) use a Mapbox POI that names an on-campus place.
-- A single-building POI can sit ~1 km from the campus centre (Shah Alam's
-- was the hotel), which is why OSM polygons win wherever they exist.
-- Other universities are left NULL for now.

set lock_timeout = '5s';

alter table public.campuses
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

update public.campuses c
   set latitude = v.lat, longitude = v.lng
  from (values
    ('Arau',                             6.44987, 100.28115),
    ('Bertam',                           5.52747, 100.47391),
    ('Bukit Besi',                       4.72715, 103.19906),
    ('Dengkil',                          2.86957, 101.66750),
    ('Jasin',                            2.22547, 102.45561),
    ('Kota Bharu',                       6.11534, 102.23085),
    ('Kota Kinabalu',                    6.06649, 116.13512),
    ('Kota Samarahan',                   1.44822, 110.44636),
    ('Kuala Pilah',                      2.79331, 102.22004),
    ('Kuala Terengganu (Chendering)',    5.26197, 103.16551),
    ('Machang',                          5.76200, 102.27610),
    ('Mukah',                            2.86177, 112.02823),
    ('Permatang Pauh (Bukit Mertajam)',  5.38335, 100.41525),
    ('Puncak Alam',                      3.20265, 101.45251),
    ('Puncak Perdana',                   3.13367, 101.49435),
    ('Raub',                             3.76352, 101.85939),
    ('Rembau',                           2.51051, 102.06363),
    ('Samarahan 2',                      1.45031, 110.43002),
    ('Seremban 3',                       2.67104, 101.93535),
    ('Shah Alam (Main Campus)',          3.06869, 101.49960),
    ('Sungai Buloh',                     3.22242, 101.59343),
    ('Sungai Petani',                    5.71387, 100.45056),
    ('Tapah',                            4.17829, 101.21980),
    ('Alor Gajah (Lendu)',               2.36635, 102.18275),
    ('Bandaraya Melaka',                 2.20758, 102.24982),
    ('Dungun',                           4.70199, 103.44276),
    ('Jalan Othman (PJ)',                3.08750, 101.65188),
    ('Jengka',                           3.75293, 102.56541),
    ('Pasir Gudang',                     1.52687, 103.87422),
    ('Segamat',                          2.48888, 102.72858),
    ('Selayang',                         3.24486, 101.65051),
    ('Seri Iskandar',                    4.35597, 100.95661),
    ('Tawau',                            4.37096, 118.09602),
    ('Teluk Intan',                      4.00599, 101.03758)
  ) as v(name, lat, lng)
 where c.university_id = 'uitm'
   and c.name = v.name;
