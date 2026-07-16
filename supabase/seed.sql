-- Shared demo assets. User-owned demo records are created by the application after demo sign-in.
insert into public.assets(symbol,name,category,currency,provider_id) values
('TRY','Türk Lirası','cash','TRY','demo-try'),
('XAUTRY','Gram Altın','gold','TRY','demo-gold'),
('THYAO','Türk Hava Yolları','bist','TRY','demo-thyao'),
('TUPRS','Tüpraş','bist','TRY','demo-tupras'),
('VOO','Vanguard S&P 500 ETF','etf','USD','demo-voo'),
('BTC','Bitcoin','crypto','TRY','demo-btc'),
('PPF','Para Piyasası Fonu','fund','TRY','demo-ppf')
on conflict(symbol,category) do nothing;
