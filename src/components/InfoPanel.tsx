import { useEffect, useRef } from 'react';
import { Box, Text, Badge, Flex, Separator } from '@chakra-ui/react';
import gsap from 'gsap';
import { prefectureMap, rankMap, nationalAvg, minRate, maxRate, rankedData, NURSING_RATE, PENSION_RATE, EMPLOYMENT_RATE } from '../data/insuranceRates';

interface Props {
  selectedId: number | null;
}

function RateBar({ value, min, max, color }: { value: number; min: number; max: number; color: string }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <Box bg="whiteAlpha.100" borderRadius="full" h="8px" w="100%" overflow="hidden">
      <Box
        bg={color}
        borderRadius="full"
        h="100%"
        style={{ width: `${Math.max(pct, 2)}%`, transition: 'width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
      />
    </Box>
  );
}

function CountUp({ value, decimals = 2 }: { value: number; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const obj = useRef({ val: 0 });

  useEffect(() => {
    const target = { val: 0 };
    obj.current = target;
    gsap.to(target, {
      val: value,
      duration: 1,
      ease: 'power2.out',
      onUpdate: () => {
        if (ref.current) ref.current.textContent = target.val.toFixed(decimals);
      },
    });
  }, [value, decimals]);

  return <span ref={ref}>0.00</span>;
}

function InsuranceRow({
  label,
  totalRate,
  note,
  color,
  isNational,
}: {
  label: string;
  totalRate: number;
  note?: string;
  color: string;
  isNational?: boolean;
}) {
  const employeeRate = +(totalRate / 2).toFixed(2);
  const employerRate = +(totalRate / 2).toFixed(2);

  return (
    <Box p={3} bg="whiteAlpha.50" borderRadius="lg" border="1px solid" borderColor="whiteAlpha.100">
      <Flex justify="space-between" align="center" mb={1}>
        <Text fontSize="xs" color="gray.400" fontWeight="600">
          {label}
          {isNational && (
            <Badge ml={2} size="sm" colorPalette="blue" variant="subtle">全国一律</Badge>
          )}
        </Text>
        {note && <Text fontSize="xs" color="gray.500">{note}</Text>}
      </Flex>
      <Flex align="baseline" gap={1}>
        <Text fontSize="2xl" fontWeight="800" color={color} fontFamily="mono">
          <CountUp value={totalRate} />
        </Text>
        <Text fontSize="sm" color="gray.400">%</Text>
        <Text fontSize="xs" color="gray.500" ml={2}>(合計)</Text>
      </Flex>
      <Flex gap={4} mt={1}>
        <Text fontSize="xs" color="gray.400">
          従業員: <Text as="span" color="gray.200" fontWeight="600">{employeeRate.toFixed(2)}%</Text>
        </Text>
        <Text fontSize="xs" color="gray.400">
          事業主: <Text as="span" color="gray.200" fontWeight="600">{employerRate.toFixed(2)}%</Text>
        </Text>
      </Flex>
    </Box>
  );
}

export default function InfoPanel({ selectedId }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const pref = selectedId !== null ? prefectureMap.get(selectedId) : null;
  const rank = selectedId !== null ? rankMap.get(selectedId) : null;

  useEffect(() => {
    if (!panelRef.current) return;
    if (pref) {
      gsap.fromTo(
        panelRef.current,
        { x: 40, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.45, ease: 'power3.out' }
      );
    }
  }, [selectedId, pref]);

  const totalWithNursing = pref ? +(pref.healthRate + NURSING_RATE).toFixed(2) : 0;

  const getRankColor = (r: number) => {
    if (r <= 5) return 'red.400';
    if (r <= 15) return 'orange.400';
    if (r >= 43) return 'green.400';
    if (r >= 33) return 'teal.400';
    return 'blue.400';
  };

  return (
    <Box ref={panelRef} h="100%" display="flex" flexDirection="column" gap={4}>
      {!pref ? (
        /* Placeholder */
        <Box flex={1} display="flex" flexDirection="column" gap={4}>
          <Box
            bg="whiteAlpha.50"
            borderRadius="xl"
            p={6}
            border="1px solid"
            borderColor="whiteAlpha.100"
            textAlign="center"
          >
            <Text fontSize="3xl" mb={3}>🗾</Text>
            <Text color="gray.400" fontSize="sm">
              地図の都道府県をクリックして<br />保険料率の詳細を確認しましょう
            </Text>
          </Box>

          {/* Rankings */}
          <Box bg="whiteAlpha.50" borderRadius="xl" p={4} border="1px solid" borderColor="whiteAlpha.100">
            <Text fontSize="sm" fontWeight="700" color="gray.300" mb={3}>料率ランキング（高い順）</Text>
            {rankedData.slice(0, 5).map((p, i) => (
              <Flex key={p.id} justify="space-between" align="center" py={1.5}>
                <Flex align="center" gap={2}>
                  <Text fontSize="xs" color="red.400" fontWeight="700" w="20px">#{i + 1}</Text>
                  <Text fontSize="sm" color="gray.200">{p.nameJa}</Text>
                </Flex>
                <Text fontSize="sm" color="red.300" fontWeight="600" fontFamily="mono">{p.healthRate.toFixed(2)}%</Text>
              </Flex>
            ))}
            <Separator my={2} borderColor="whiteAlpha.100" />
            <Text fontSize="xs" color="gray.500" mb={2} textAlign="center">料率の低い上位5県</Text>
            {[...rankedData].reverse().slice(0, 5).map((p, i) => (
              <Flex key={p.id} justify="space-between" align="center" py={1.5}>
                <Flex align="center" gap={2}>
                  <Text fontSize="xs" color="green.400" fontWeight="700" w="20px">#{47 - i}</Text>
                  <Text fontSize="sm" color="gray.200">{p.nameJa}</Text>
                </Flex>
                <Text fontSize="sm" color="green.300" fontWeight="600" fontFamily="mono">{p.healthRate.toFixed(2)}%</Text>
              </Flex>
            ))}
          </Box>
        </Box>
      ) : (
        /* Prefecture Detail */
        <Box flex={1} display="flex" flexDirection="column" gap={3}>
          {/* Header */}
          <Box bg="whiteAlpha.50" borderRadius="xl" p={4} border="1px solid" borderColor="whiteAlpha.100">
            <Flex justify="space-between" align="flex-start">
              <Box>
                <Text fontSize="xs" color="gray.400" mb={0.5}>{pref.region}地方</Text>
                <Text fontSize="2xl" fontWeight="800" color="white">{pref.nameJa}</Text>
                <Text fontSize="sm" color="gray.400">{pref.nameEn}</Text>
              </Box>
              <Box textAlign="right">
                <Text fontSize="xs" color="gray.500" mb={1}>全国ランキング</Text>
                <Text fontSize="2xl" fontWeight="800" color={getRankColor(rank!)} fontFamily="mono">
                  #{rank}
                </Text>
                <Text fontSize="xs" color="gray.500">/ 47都道府県</Text>
              </Box>
            </Flex>

            <Box mt={3}>
              <Flex justify="space-between" mb={1}>
                <Text fontSize="xs" color="gray.400">全国最低 {minRate}%</Text>
                <Text fontSize="xs" color="gray.400">全国最高 {maxRate}%</Text>
              </Flex>
              <RateBar value={pref.healthRate} min={minRate} max={maxRate} color="linear-gradient(to right, #38bdf8, #f59e0b, #ef4444)" />
              <Flex justify="space-between" mt={1}>
                <Text fontSize="xs" color="gray.500">全国平均: {nationalAvg}%</Text>
                <Text fontSize="xs" color={pref.healthRate > nationalAvg ? 'red.400' : 'green.400'} fontWeight="600">
                  {pref.healthRate > nationalAvg ? '▲' : '▼'} {Math.abs(pref.healthRate - nationalAvg).toFixed(2)}%
                </Text>
              </Flex>
            </Box>
          </Box>

          {/* Insurance breakdown */}
          <Text fontSize="xs" fontWeight="700" color="gray.400" textTransform="uppercase" letterSpacing="wider">
            社会保険料率の内訳
          </Text>

          <InsuranceRow
            label="健康保険料率"
            totalRate={pref.healthRate}
            note="協会けんぽ 2024年度"
            color="blue.300"
          />

          <InsuranceRow
            label="介護保険料率"
            totalRate={NURSING_RATE}
            note="40〜64歳が対象"
            color="purple.300"
            isNational
          />

          <Box p={3} bg="blue.900" borderRadius="lg" border="1px solid" borderColor="blue.700">
            <Text fontSize="xs" color="blue.300" fontWeight="700" mb={1}>
              健康 + 介護（40〜64歳の場合）
            </Text>
            <Flex align="baseline" gap={1}>
              <Text fontSize="2xl" fontWeight="800" color="blue.200" fontFamily="mono">
                <CountUp value={totalWithNursing} />
              </Text>
              <Text fontSize="sm" color="blue.400">%</Text>
            </Flex>
            <Text fontSize="xs" color="blue.400" mt={0.5}>
              従業員負担: {(totalWithNursing / 2).toFixed(2)}%
            </Text>
          </Box>

          <Separator borderColor="whiteAlpha.100" />

          {/* Fixed rates */}
          <Text fontSize="xs" fontWeight="700" color="gray.400" textTransform="uppercase" letterSpacing="wider">
            固定保険料率（参考）
          </Text>

          <Flex gap={2}>
            <Box flex={1} p={3} bg="whiteAlpha.50" borderRadius="lg" border="1px solid" borderColor="whiteAlpha.100">
              <Text fontSize="xs" color="gray.400" mb={1}>厚生年金</Text>
              <Text fontSize="lg" fontWeight="700" color="yellow.300" fontFamily="mono">{PENSION_RATE}%</Text>
              <Text fontSize="xs" color="gray.500">全国一律</Text>
            </Box>
            <Box flex={1} p={3} bg="whiteAlpha.50" borderRadius="lg" border="1px solid" borderColor="whiteAlpha.100">
              <Text fontSize="xs" color="gray.400" mb={1}>雇用保険</Text>
              <Text fontSize="lg" fontWeight="700" color="green.300" fontFamily="mono">{EMPLOYMENT_RATE}%</Text>
              <Text fontSize="xs" color="gray.500">従業員負担分</Text>
            </Box>
          </Flex>

          <Box p={3} bg="orange.900" borderRadius="lg" border="1px solid" borderColor="orange.700">
            <Text fontSize="xs" color="orange.300" fontWeight="700" mb={1}>
              社会保険料合計（40〜64歳・従業員負担）
            </Text>
            <Flex align="baseline" gap={1}>
              <Text fontSize="2xl" fontWeight="800" color="orange.200" fontFamily="mono">
                <CountUp value={+(totalWithNursing / 2 + PENSION_RATE / 2 + EMPLOYMENT_RATE).toFixed(2)} />
              </Text>
              <Text fontSize="sm" color="orange.400">%</Text>
            </Flex>
            <Text fontSize="xs" color="orange.400" mt={0.5}>
              月給30万円の場合: 約 {Math.round(300000 * (totalWithNursing / 2 + PENSION_RATE / 2 + EMPLOYMENT_RATE) / 100).toLocaleString()} 円/月
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
