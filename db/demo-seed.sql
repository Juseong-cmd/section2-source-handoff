-- Run only in the separate development database, before the first application start.
insert into public.app_state (key, value)
values (
  'section2_dev',
  '{
    "members": [
      {"id":"demo-01","name":"가상 팀원 A","color":"#3b82f6","active":true},
      {"id":"demo-02","name":"가상 팀원 B","color":"#0f766e","active":true},
      {"id":"demo-03","name":"가상 팀원 C","color":"#7c3aed","active":true}
    ],
    "absences": [
      {"id":"demo-absence","memberId":"demo-01","startDate":"2027-02-10","endDate":"2027-02-10","type":"annual","label":"","memo":"가상 일정"}
    ]
  }'::jsonb
)
on conflict (key) do nothing;
