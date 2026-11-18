import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API, type SilentForbiddenConfig } from '@/api/api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Text, Tooltip, Stack, Badge } from '@mantine/core';
import {
  faSearch,
  faChevronLeft,
  faChevronRight,
  faUserTie,
  faClock,
} from '@fortawesome/free-solid-svg-icons';
import { useOptions, roomOptionLabel } from '@/api/options';
import { useGroupsData } from '@/pages/groups/useGroupsData';
import { usePermission } from '@/hooks/usePermission';
import { useOwnTeacher } from '@/pages/groups/useOwnTeacher';
import FilterBar, { type FilterBarField } from '@/components/FilterBar';
import { countFilterBarValues } from '@/components/FilterBar/filterBar.utils';
import FilterButton from '@/components/FilterButton';
import type { Group } from '@/types/group.types';
import type { DemoLesson } from '@/types/demoLesson.types';
import { ScheduleCard } from './ScheduleCard';
import { DetailModal } from './DetailModal';
import { DemoDetailModal } from './DemoDetailModal';
import { getLocalized } from '@/utils/getLocalized';
import { useTranslation } from 'react-i18next';
import './lessonSchedule.css';

const WEEKDAY_MAP: Record<number, string> = {
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
  0: 'sunday',
};

const WEEKDAY_LABELS: Record<string, string> = {
  monday: 'Dushanba',
  tuesday: 'Seshanba',
  wednesday: 'Chorshanba',
  thursday: 'Payshanba',
  friday: 'Juma',
  saturday: 'Shanba',
  sunday: 'Yakshanba',
};

const WEEKDAYS_SHORT = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];

const MONTH_NAMES = [
  'Yanvar',
  'Fevral',
  'Mart',
  'Aprel',
  'May',
  'Iyun',
  'Iyul',
  'Avgust',
  'Sentabr',
  'Oktabr',
  'Noyabr',
  'Dekabr',
];

function getWeeklyDates(baseDate: Date) {
  const dates = [];
  const day = baseDate.getDay();
  const diff = baseDate.getDate() - day + (day === 0 ? -6 : 1);
  const startOfWeek = new Date(new Date(baseDate).setDate(diff));

  for (let i = 0; i < 6; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    const weekdayKey = WEEKDAY_MAP[d.getDay()];
    dates.push({
      key: formatDateStr(d),
      label: WEEKDAY_LABELS[weekdayKey],
      date: d.toLocaleDateString('ru-RU'),
      fullDate: d,
      weekdayKey,
    });
  }
  return dates;
}

function getDailyTimeSlots(interval: number) {
  const slots = [];
  let current = 6 * 60;
  const end = 21 * 60;

  while (current < end) {
    const h = Math.floor(current / 60);
    const m = current % 60;
    const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    slots.push(timeStr);
    current += interval;
  }
  return slots;
}

function formatDateStr(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function timeToMinutes(timeStr: string) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

const TIMELINE_COLORS = ['#003f7a', '#d91111', '#f39200', '#109910', '#8b5cf6', '#0ea5e9'];

function getMonthlyGrid(currentMonth: Date) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  let startDay = firstDayOfMonth.getDay();
  if (startDay === 0) startDay = 7;

  const grid = [];

  const offset = startDay - 1;
  for (let i = 0; i < offset && i < 6; i++) {
    grid.push(null);
  }

  for (let d = 1; d <= lastDayOfMonth.getDate(); d++) {
    const dateObj = new Date(year, month, d);
    const dayOfWeek = dateObj.getDay();

    if (dayOfWeek !== 0) {
      grid.push({
        day: d,
        key: formatDateStr(dateObj),
        weekdayKey: WEEKDAY_MAP[dayOfWeek],
      });
    }
  }

  return grid;
}

type ScheduleFilterKey = 'teacher' | 'room' | 'branch' | 'dayType' | 'interval';

const EMPTY_SCHEDULE_FILTERS: Record<ScheduleFilterKey, string> = {
  teacher: '',
  room: '',
  branch: '',
  dayType: '',
  interval: '',
};

const LessonSchedule = () => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [view, setView] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<Record<ScheduleFilterKey, string>>(
    EMPTY_SCHEDULE_FILTERS,
  );
  const [detailGroup, setDetailGroup] = useState<Group | null>(null);
  const [detailDemo, setDetailDemo] = useState<DemoLesson | null>(null);

  const { teacher: teacherFilter, room: roomFilter, branch: branchFilter } = filters;
  // Kun turi faqat haftalik/oylik ko'rinishda, interval faqat kunlik ko'rinishda ishlaydi —
  // ko'rinish almashganda tanlangan qiymat jadvalga ta'sir qilib qolmasin.
  const dayTypeFilter = view === 'daily' ? '' : filters.dayType;
  const intervalFilter = view === 'daily' ? filters.interval : '';

  const ODD_DAYS = ['monday', 'wednesday', 'friday'];
  const EVEN_DAYS = ['tuesday', 'thursday', 'saturday'];

  const { data: rooms = [] } = useOptions('rooms');
  // Guruhlar: `groups.view` bo'lsa `/groups`, bo'lmasa `/options/groups` (sahifa uchun `lessons_schedules.view` yetadi).
  // Qamrov «o'ziniki» bo'lsa faqat o'z guruhlari (`canSeeAll('lessons_schedules')`).
  const {
    groups,
    ownOnly,
    blocked: needsGroupsAccess,
    daysMissing,
    isPending: groupsPending,
  } = useGroupsData({ scope: 'lessons_schedules' });
  // Demo darslar — jadvalning qo'shimcha qatlami: faqat rolda «Demo darslar» sahifasi bo'lsa so'raladi.
  const canViewDemoLessons = usePermission('demo_lessons.view');
  const { data: allDemoLessons = [] } = useQuery<DemoLesson[]>({
    queryKey: ['demo-lessons-schedule'],
    queryFn: async () => {
      // Demo darslar — jadvalning QO'SHIMCHA qatlami, asosiy mazmuni emas
      // (guruh darslari `groups`dan alohida keladi). `demo-lessons.view`
      // ruxsati bo'lmagan foydalanuvchi uchun bu 403 bilan tugaydi — lekin
      // "Dars jadvali"ning o'zini ko'rish huquqi bilan bog'liq emas, shuning
      // uchun `skip403Toast` bilan "Sahifaga ruxsat yo'q" degan chalg'ituvchi
      // ogohlantirish chiqmaydi (jadvalning qolgan qismi baribir ishlayveradi).
      const config: SilentForbiddenConfig = { skip403Toast: true };
      const res = await API.get('/demo-lessons', config);
      const data = res.data?.data ?? res.data ?? [];
      return Array.isArray(data) ? data : [];
    },
    enabled: canViewDemoLessons,
    retry: false,
    throwOnError: false,
  });

  const { isOwnTeacher } = useOwnTeacher();
  const demoLessons = useMemo(
    () =>
      ownOnly
        ? allDemoLessons.filter((dl) => isOwnTeacher({ id: dl.teacher_id ?? dl.teacher?.id }))
        : allDemoLessons,
    [ownOnly, allDemoLessons, isOwnTeacher],
  );

  const weeklyDates = useMemo(() => getWeeklyDates(selectedDate), [selectedDate]);
  const todayKey = formatDateStr(new Date());
  const monthlyGrid = useMemo(() => getMonthlyGrid(selectedDate), [selectedDate]);
  const dailySlots = useMemo(
    () => getDailyTimeSlots(Number(intervalFilter || 30)),
    [intervalFilter],
  );

  const teachers = useMemo(() => {
    const list: Record<number, { id: number; name: string }> = {};
    groups.forEach((g) => {
      if (g.teacher) {
        list[g.teacher.id] = {
          id: g.teacher.id,
          name: `${g.teacher.first_name} ${g.teacher.last_name}`,
        };
      }
    });
    return Object.values(list);
  }, [groups]);

  const branches = useMemo(() => {
    const map: Record<number, { id: number; name: string }> = {};
    groups.forEach((g) => {
      if (g.branch) map[g.branch.id] = { id: g.branch.id, name: g.branch.name_uz };
    });
    return Object.values(map);
  }, [groups]);

  const filterFields: FilterBarField<ScheduleFilterKey>[] = [
    {
      key: 'teacher',
      label: t('lessonSchedule.byTeacher', { defaultValue: "O'qituvchi bo'yicha" }),
      placeholder: t('lessonSchedule.select', { defaultValue: 'Tanlang' }),
      options: teachers.map((tch) => ({ value: tch.id, label: tch.name })),
    },
    {
      key: 'room',
      label: t('lessonSchedule.byRoom', { defaultValue: "Xona bo'yicha" }),
      placeholder: t('lessonSchedule.select', { defaultValue: 'Tanlang' }),
      options: rooms.map((r) => ({ value: r.id, label: roomOptionLabel(r, lang) })),
    },
    {
      key: 'branch',
      label: t('lessonSchedule.byBranch', { defaultValue: "Filial bo'yicha" }),
      placeholder: t('lessonSchedule.select', { defaultValue: 'Tanlang' }),
      options: branches.map((b) => ({ value: b.id, label: b.name })),
    },
    {
      key: 'dayType',
      label: t('lessonSchedule.dayType', { defaultValue: 'Kun turi' }),
      placeholder: t('lessonSchedule.select', { defaultValue: 'Tanlang' }),
      hidden: view === 'daily',
      options: [
        { value: 'odd', label: t('lessonSchedule.oddDays', { defaultValue: 'Toq kunlar' }) },
        { value: 'even', label: t('lessonSchedule.evenDays', { defaultValue: 'Juft kunlar' }) },
      ],
    },
    {
      key: 'interval',
      label: t('lessonSchedule.byInterval', { defaultValue: "Interval bo'yicha" }),
      placeholder: t('lessonSchedule.select', { defaultValue: 'Tanlang' }),
      hidden: view !== 'daily',
      options: [15, 30, 60, 90].map((m) => ({
        value: m,
        label: `${m} ${t('lessonSchedule.minutes', { defaultValue: 'minut' })}`,
      })),
    },
  ];

  const activeFilterCount = countFilterBarValues({
    teacher: teacherFilter,
    room: roomFilter,
    branch: branchFilter,
    dayType: dayTypeFilter,
    interval: intervalFilter,
  });

  const filteredGroups = useMemo(() => {
    return groups.filter((g) => {
      const matchesSearch =
        g.name.toLowerCase().includes(search.toLowerCase()) ||
        (g.course ? getLocalized(g.course, 'name', lang).toLowerCase() : '').includes(
          search.toLowerCase(),
        ) ||
        g.teacher?.first_name.toLowerCase().includes(search.toLowerCase());

      const matchesTeacher = !teacherFilter || g.teacher?.id === Number(teacherFilter);
      const matchesRoom = !roomFilter || g.room?.id === Number(roomFilter);
      const matchesBranch = !branchFilter || g.branch?.id === Number(branchFilter);
      const matchesDayType =
        !dayTypeFilter ||
        (dayTypeFilter === 'odd' && g.days.every((d) => ODD_DAYS.includes(d))) ||
        (dayTypeFilter === 'even' && g.days.every((d) => EVEN_DAYS.includes(d)));

      return matchesSearch && matchesTeacher && matchesRoom && matchesBranch && matchesDayType;
    });
  }, [groups, search, teacherFilter, roomFilter, branchFilter, dayTypeFilter, lang]);

  const displayRooms = useMemo(() => {
    if (!roomFilter) return rooms;
    return rooms.filter((r) => String(r.id) === roomFilter);
  }, [rooms, roomFilter]);

  const displayWeeklyDates = useMemo(() => {
    if (!dayTypeFilter) return weeklyDates;
    const allowed =
      dayTypeFilter === 'odd'
        ? ['monday', 'wednesday', 'friday']
        : ['tuesday', 'thursday', 'saturday'];
    return weeklyDates.filter((wd) => allowed.includes(wd.weekdayKey));
  }, [weeklyDates, dayTypeFilter]);

  const monthlyKeys = useMemo(() => {
    return monthlyGrid.filter((d) => d !== null).map((d) => d!.key);
  }, [monthlyGrid]);

  const groupsByDate = useMemo(() => {
    const data: Record<string, Group[]> = {};
    monthlyKeys.forEach((key) => {
      data[key] = [];
    });

    filteredGroups.forEach((group) => {
      monthlyKeys.forEach((key) => {
        const d = new Date(key);
        const weekdayKey = WEEKDAY_MAP[d.getDay()];
        if (group.days.includes(weekdayKey)) {
          data[key].push(group);
        }
      });
    });

    return data;
  }, [filteredGroups, monthlyKeys]);

  const tableData = useMemo(() => {
    const data: Record<string, Record<string, Group[]>> = {};
    rooms.forEach((room) => {
      data[room.id] = {};
      weeklyDates.forEach((d) => {
        data[room.id][d.key] = [];
      });
    });

    filteredGroups.forEach((group) => {
      if (group.room) {
        weeklyDates.forEach((d) => {
          if (group.days.includes(d.weekdayKey)) {
            if (data[group.room!.id]?.[d.key]) {
              data[group.room!.id][d.key].push(group);
            }
          }
        });
      }
    });

    return data;
  }, [rooms, filteredGroups, weeklyDates]);

  const demoTableData = useMemo(() => {
    const data: Record<number, Record<string, DemoLesson[]>> = {};
    rooms.forEach((room) => {
      data[room.id] = {};
      weeklyDates.forEach((d) => {
        data[room.id][d.key] = [];
      });
    });
    demoLessons.forEach((dl) => {
      if (dl.room_id != null) {
        const key = dl.date.slice(0, 10);
        if (data[dl.room_id]?.[key] !== undefined) {
          data[dl.room_id][key].push(dl);
        }
      }
    });
    return data;
  }, [rooms, demoLessons, weeklyDates]);

  const demoByDate = useMemo(() => {
    const data: Record<string, DemoLesson[]> = {};
    monthlyKeys.forEach((key) => {
      data[key] = [];
    });
    demoLessons.forEach((dl) => {
      const key = dl.date.slice(0, 10);
      if (data[key] !== undefined) data[key].push(dl);
    });
    return data;
  }, [demoLessons, monthlyKeys]);

  const navigate = (direction: number) => {
    const next = new Date(selectedDate);
    if (view === 'monthly') {
      next.setMonth(selectedDate.getMonth() + direction);
    } else if (view === 'weekly') {
      next.setDate(selectedDate.getDate() + direction * 7);
    } else {
      next.setDate(selectedDate.getDate() + direction);
    }
    setSelectedDate(next);
  };

  const currentLabel = useMemo(() => {
    if (view === 'monthly') {
      return `${MONTH_NAMES[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`;
    }
    if (view === 'weekly') {
      const start = weeklyDates[0];
      const end = weeklyDates[weeklyDates.length - 1];
      return `${start.date} - ${end.date}`;
    }
    // Daily
    const weekday = WEEKDAY_MAP[selectedDate.getDay()];
    return `${WEEKDAY_LABELS[weekday]}, ${selectedDate.toLocaleDateString('ru-RU')}`;
  }, [view, selectedDate, weeklyDates]);

  // `groups.view` ham, dars kunlarini beradigan boshqa yo'l ham yo'q — jim bo'sh jadval o'rniga sababini aytamiz.
  if (needsGroupsAccess) {
    return (
      <div className="teacher-groups-container">
        <div className="teacher-groups-empty">
          <p className="teacher-groups-empty-text">{t('lessonSchedule.needGroupsView')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="lesson-schedule-container container">
      {daysMissing && !groupsPending && (
        <p className="lesson-schedule-notice" role="status">
          <i className="fa-solid fa-circle-info" aria-hidden="true" /> {t('lessonSchedule.daysMissing')}
        </p>
      )}
      <div className="lesson-schedule-header">
        <div className="header-left">
          <div className="view-switcher">
            <button
              className={`view-btn ${view === 'daily' ? 'active' : ''}`}
              onClick={() => setView('daily')}
            >
              Kunlik
            </button>
            <button
              className={`view-btn ${view === 'weekly' ? 'active' : ''}`}
              onClick={() => setView('weekly')}
            >
              Haftalik
            </button>
            <button
              className={`view-btn ${view === 'monthly' ? 'active' : ''}`}
              onClick={() => setView('monthly')}
            >
              Oylik
            </button>
          </div>

          <div className="month-nav">
            <button onClick={() => navigate(-1)} className="nav-btn">
              <FontAwesomeIcon icon={faChevronLeft} />
            </button>
            <Text fw={700} className="month-name-display">
              {currentLabel}
            </Text>
            <button onClick={() => navigate(1)} className="nav-btn">
              <FontAwesomeIcon icon={faChevronRight} />
            </button>
          </div>
        </div>

        <div className="header-right">
          <div className="search-input-wrap">
            <FontAwesomeIcon icon={faSearch} className="search-icon" />
            <input
              type="text"
              placeholder="Ma'lumotlarni qidirish..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <FilterButton
            onClick={() => setFilterOpen((v) => !v)}
            active={filterOpen || activeFilterCount > 0}
            expanded={filterOpen}
            count={activeFilterCount}
            label={t('lessonSchedule.sort', { defaultValue: 'Saralash' })}
          />
        </div>
      </div>

      {filterOpen && (
        <div className="schedule-filter-card">
          <FilterBar
            fields={filterFields}
            values={filters}
            onChange={setFilters}
            onReset={() => setFilters(EMPTY_SCHEDULE_FILTERS)}
            onClose={() => setFilterOpen(false)}
            ariaLabel={t('lessonSchedule.sort', { defaultValue: 'Saralash' })}
          />
        </div>
      )}

      {view === 'daily' && (
        <div className="schedule-table-container">
          <table className="schedule-table daily-table">
            <thead>
              <tr>
                <th className="room-header corner-header">Xona\soat</th>
                {dailySlots.map((time) => (
                  <th key={time} className="time-header">
                    {time}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRooms.map((room) => {
                const dateKey = formatDateStr(selectedDate);
                const lessonsForRoom = tableData[room.id]?.[dateKey] || [];
                const COLUMN_WIDTH = 80;
                const intervalVal = Number(intervalFilter || 30);
                const pixelsPerMinute = COLUMN_WIDTH / intervalVal;
                const startOfDayMin = 6 * 60;

                const roomName = room.label;
                const demoForRoom = demoLessons.filter(
                  (dl) => dl.room_id === room.id && dl.date.slice(0, 10) === dateKey,
                );

                return (
                  <tr key={room.id}>
                    <td className="room-cell">
                      {roomName.includes('-xona') ? roomName : `${roomName} -xona`}
                    </td>
                    {dailySlots.map((time, index) => (
                      <td key={time} className="time-cell">
                        {index === 0 && (
                          <div className="timeline-wrapper">
                            {lessonsForRoom.map((group) => {
                              const startMin = timeToMinutes(group.start_time);
                              const endMin = timeToMinutes(group.end_time);
                              const left =
                                (startMin - startOfDayMin) * pixelsPerMinute + COLUMN_WIDTH / 2;
                              const width = (endMin - startMin) * pixelsPerMinute;
                              const color = TIMELINE_COLORS[group.id % TIMELINE_COLORS.length];

                              return (
                                <div
                                  key={group.id}
                                  className="timeline-bar"
                                  style={{
                                    left: `${left}px`,
                                    width: `${width}px`,
                                    backgroundColor: color,
                                  }}
                                  onClick={() => setDetailGroup(group)}
                                >
                                  <span className="timeline-bar-text">
                                    {group.name} {group.teacher?.last_name}{' '}
                                    {group.teacher?.first_name}
                                  </span>
                                </div>
                              );
                            })}

                            {demoForRoom.map((dl) => {
                              const startMin = timeToMinutes(dl.start_time);
                              const endMin = timeToMinutes(dl.end_time);
                              const left =
                                (startMin - startOfDayMin) * pixelsPerMinute + COLUMN_WIDTH / 2;
                              const width = (endMin - startMin) * pixelsPerMinute;

                              return (
                                <div
                                  key={`demo-${dl.id}`}
                                  className="timeline-bar timeline-bar--demo"
                                  style={{
                                    left: `${left}px`,
                                    width: `${width}px`,
                                    cursor: 'pointer',
                                  }}
                                  onClick={() => setDetailDemo(dl)}
                                >
                                  <span className="timeline-bar-text">
                                    Demo: {dl.group?.name} {dl.teacher?.last_name}{' '}
                                    {dl.teacher?.first_name}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {view === 'weekly' && (
        <div className="schedule-table-container">
          <table className="schedule-table">
            <thead>
              <tr>
                <th className="room-header corner-header">Xona\Kunlar</th>
                {displayWeeklyDates.map((wd) => (
                  <th
                    key={wd.key}
                    onClick={() => {
                      setSelectedDate(wd.fullDate);
                      setView('daily');
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="day-header">
                      <span className="day-name">{wd.label}</span>
                      <span className="day-date">{wd.date}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRooms.map((room) => (
                <tr key={room.id}>
                  <td className="room-cell">{room.label}-xona</td>
                  {displayWeeklyDates.map((d) => (
                    <td key={`${room.id}-${d.key}`}>
                      {tableData[room.id]?.[d.key]?.map((group) => (
                        <ScheduleCard
                          key={group.id}
                          group={group}
                          onClick={() => setDetailGroup(group)}
                        />
                      ))}
                      {demoTableData[room.id]?.[d.key]?.map((dl) => (
                        <div
                          key={`demo-${dl.id}`}
                          className="schedule-card schedule-card--demo"
                          onClick={() => setDetailDemo(dl)}
                          style={{ cursor: 'pointer' }}
                        >
                          <div className="schedule-card-header">
                            <Badge color="gray" variant="light" size="lg" radius="sm">
                              Demo
                            </Badge>
                            <Badge color="gray" variant="filled" size="lg" radius="sm">
                              {dl.group?.name ?? '—'}
                            </Badge>
                          </div>
                          <Stack gap={6} mt={4} className="card-info">
                            <div className="info-item">
                              <FontAwesomeIcon icon={faUserTie} className="info-icon" />
                              <Text size="md" className="teacher-name">
                                {dl.teacher?.first_name} {dl.teacher?.last_name}
                              </Text>
                            </div>
                            <div className="info-item time">
                              <FontAwesomeIcon icon={faClock} className="info-icon" />
                              <Text
                                size="md"
                                fw={700}
                                style={{ fontSize: '12px', color: '#64748b' }}
                              >
                                {dl.start_time.slice(0, 5)} - {dl.end_time.slice(0, 5)}
                              </Text>
                            </div>
                          </Stack>
                        </div>
                      ))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === 'monthly' && (
        <div className="monthly-calendar-container">
          <div className="calendar-grid-header">
            {WEEKDAYS_SHORT.map((day) => (
              <div key={day} className="grid-header-cell">
                {day}
              </div>
            ))}
          </div>
          <div className="calendar-grid">
            {monthlyGrid.map((dayData, idx) => {
              const filteredByDayType =
                dayData &&
                dayTypeFilter &&
                !(
                  dayTypeFilter === 'odd'
                    ? ['monday', 'wednesday', 'friday']
                    : ['tuesday', 'thursday', 'saturday']
                ).includes(dayData.weekdayKey);
              return (
                <div
                  key={idx}
                  className={`calendar-cell ${!dayData || filteredByDayType ? 'empty' : ''}`}
                >
                  {dayData && !filteredByDayType && (
                    <>
                      <span className="cell-date">{dayData.day}</span>
                      <div className="cell-content">
                        {groupsByDate[dayData.key]?.map((group) => (
                          <Tooltip
                            key={group.id}
                            label={`${group.name} (${getLocalized(group.level, 'name', lang)})`}
                          >
                            <div
                              className="compact-lesson-item"
                              onClick={() => setDetailGroup(group)}
                            >
                              <span className="item-text">
                                {group.name} - {getLocalized(group.level, 'name', lang)}{' '}
                                {group.start_time.slice(0, 5)}-{group.end_time.slice(0, 5)}
                              </span>
                            </div>
                          </Tooltip>
                        ))}
                        {demoByDate[dayData.key]?.map((dl) => (
                          <Tooltip key={`demo-${dl.id}`} label={`Demo: ${dl.group?.name ?? '—'}`}>
                            <div
                              className="compact-lesson-item compact-lesson-item--demo"
                              onClick={() => setDetailDemo(dl)}
                              style={{ cursor: 'pointer' }}
                            >
                              <span className="item-text">
                                Demo: {dl.group?.name ?? '—'} {dl.start_time.slice(0, 5)}-
                                {dl.end_time.slice(0, 5)}
                              </span>
                            </div>
                          </Tooltip>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mobile-view">
        {weeklyDates.map((wd) => {
          const dayGroups = filteredGroups.filter((g) => g.days.includes(wd.weekdayKey));
          const dayDemos = demoLessons.filter((dl) => dl.date.slice(0, 10) === wd.key);
          const dayCount = dayGroups.length + dayDemos.length;
          const isToday = wd.key === todayKey;

          return (
            <div
              key={wd.key}
              className={`msch-day${isToday ? ' msch-day--today' : ''}${
                dayCount === 0 ? ' msch-day--empty' : ''
              }`}
            >
              <div className="msch-day__head">
                <span className="msch-day__weekday">{wd.label}</span>
                <span className="msch-day__date">{wd.date}</span>
                {isToday && <span className="msch-day__today">{t('lessonSchedule.today', { defaultValue: 'Bugun' })}</span>}
                {dayCount > 0 && <span className="msch-day__count">{dayCount}</span>}
              </div>

              {dayCount === 0 ? (
                // Guruhlar hali kelayotgan paytda «Dars biriktirilmagan» deb yozmaymiz (jadval to'lib boradi).
                <div className="msch-day__none">
                  {groupsPending
                    ? ''
                    : t('lessonSchedule.noLessonsDay', { defaultValue: 'Dars biriktirilmagan' })}
                </div>
              ) : (
                <div className="msch-day__cards">
                  {dayGroups.map((group) => (
                    <ScheduleCard
                      key={group.id}
                      group={group}
                      isMobile
                      onClick={() => setDetailGroup(group)}
                    />
                  ))}
                  {dayDemos.map((dl) => (
                    <div
                      key={`demo-${dl.id}`}
                      className="schedule-card schedule-card--demo mobile"
                      onClick={() => setDetailDemo(dl)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="schedule-card-header">
                        <Badge color="gray" variant="light" size="lg" radius="sm">
                          Demo
                        </Badge>
                        <Badge color="gray" variant="filled" size="lg" radius="sm">
                          {dl.group?.name ?? '—'}
                        </Badge>
                      </div>
                      <Stack gap={6} mt={4} className="card-info">
                        <div className="info-item">
                          <FontAwesomeIcon icon={faUserTie} className="info-icon" />
                          <Text size="md">
                            {dl.teacher?.first_name} {dl.teacher?.last_name}
                          </Text>
                        </div>
                        <div className="info-item time">
                          <FontAwesomeIcon icon={faClock} className="info-icon" />
                          <Text size="md" fw={700} style={{ fontSize: '12px', color: '#64748b' }}>
                            {dl.start_time.slice(0, 5)} - {dl.end_time.slice(0, 5)}
                          </Text>
                        </div>
                      </Stack>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <DetailModal
        group={detailGroup}
        opened={!!detailGroup}
        onClose={() => setDetailGroup(null)}
      />

      <DemoDetailModal
        demoLesson={detailDemo}
        opened={!!detailDemo}
        onClose={() => setDetailDemo(null)}
      />
    </div>
  );
};

export default LessonSchedule;
