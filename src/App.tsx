import { useState, useRef, useEffect } from "react";
import { Box, Flex, Text, Heading, Badge } from "@chakra-ui/react";
import gsap from "gsap";
import JapanMap from "./components/JapanMap";
import InfoPanel from "./components/InfoPanel";
import { nationalAvg } from "./data/insuranceRates";

export default function App() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tl = gsap.timeline();
    if (headerRef.current) {
      tl.fromTo(
        headerRef.current,
        { y: -30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, ease: "power3.out" },
      );
    }
    if (mapRef.current) {
      tl.fromTo(
        mapRef.current,
        { x: -40, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.5, ease: "power3.out" },
        "-=0.3",
      );
    }
    if (panelRef.current) {
      tl.fromTo(
        panelRef.current,
        { x: 40, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.5, ease: "power3.out" },
        "-=0.4",
      );
    }
  }, []);

  return (
    <Box
      minH="100vh"
      style={{
        background: "#f0f2f5",
      }}
      p={4}
    >
      {/* Header */}
      <Box ref={headerRef} mb={4}>
        <Flex align="center" justify="space-between" wrap="wrap" gap={3}>
          <Box>
            <Flex align="center" gap={2} mb={1}>
              <Text fontSize="xl">🏥</Text>
              <Heading size="xl" fontWeight="900">
                都道府県別 健康保険料率マップ
              </Heading>
            </Flex>
            <Text color="gray.600" fontSize="sm">
              協会けんぽ 2024年度 | 地図をクリックして各都道府県の保険料率を確認
            </Text>
          </Box>
          <Flex gap={3} align="center">
            <Box textAlign="center">
              <Text fontSize="xs" color="gray.500">
                全国平均
              </Text>
              <Text
                fontSize="lg"
                fontWeight="800"
                color="blue.600"
                fontFamily="mono"
              >
                {nationalAvg}%
              </Text>
            </Box>
            <Badge
              colorPalette="blue"
              variant="subtle"
              px={3}
              py={1}
              borderRadius="full"
              fontSize="xs"
            >
              47都道府県
            </Badge>
          </Flex>
        </Flex>
      </Box>

      {/* Main content */}
      <Flex
        gap={4}
        align={{ base: "stretch", lg: "stretch" }}
        direction={{ base: "column", lg: "row" }}
      >
        {/* Map */}
        <Box
          ref={mapRef}
          flex="1"
          bg="white"
          borderRadius="2xl"
          border="1px solid"
          borderColor="gray.200"
          overflow="hidden"
          style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.07)", display: "flex", flexDirection: "column" }}
          maxH={{ base: "auto", lg: "calc(100vh - 140px)" }}
          p={2}
        >
          <JapanMap
            selectedId={selectedId}
            hoveredId={hoveredId}
            onSelect={setSelectedId}
            onHover={setHoveredId}
          />
        </Box>

        {/* Info panel */}
        <Box
          ref={panelRef}
          w={{ base: "100%", lg: "340px" }}
          flexShrink={0}
          bg="white"
          borderRadius="2xl"
          border="1px solid"
          borderColor="gray.200"
          p={4}
          style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.07)" }}
          overflowY="auto"
          maxH={{ base: "auto", lg: "calc(100vh - 140px)" }}
        >
          <InfoPanel selectedId={selectedId} />
        </Box>
      </Flex>

      {/* Footer */}
      <Box mt={4} textAlign="center">
        <Text fontSize="xs" color="gray.500">
          出典: 全国健康保険協会（協会けんぽ）2024年度 都道府県単位保険料率 ／
          厚生年金・雇用保険料率は2024年度現行値
        </Text>
      </Box>
    </Box>
  );
}
