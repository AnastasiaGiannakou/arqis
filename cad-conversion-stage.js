(function () {
  function boundsOf(shape) {
    const xs = shape.points.map((point) => point.x);
    const ys = shape.points.map((point) => point.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    return { width, height, area: width * height };
  }

  function isRoomLike(shape) {
    if (!shape?.points?.length) return false;
    const bounds = boundsOf(shape);
    const smallestSide = Math.min(bounds.width, bounds.height);
    const aspectRatio = Math.max(bounds.width, bounds.height) / Math.max(smallestSide, 1e-9);
    const fillRatio = (shape.rawArea || 0) / Math.max(bounds.area, 1e-9);
    return (shape.rawArea || 0) > 2
      && smallestSide > 0.45
      && aspectRatio < 8
      && fillRatio > 0.08;
  }

  function likelyFloorPlan(candidate) {
    const shapes = candidate?.shapes || [];
    if (!shapes.length) return false;
    const roomLikeCount = shapes.filter(isRoomLike).length;
    const totalArea = shapes.reduce((sum, shape) => sum + (shape.rawArea || 0), 0);
    return roomLikeCount >= Math.min(2, shapes.length) && totalArea > 4;
  }

  function floorCandidatesFrom(shapes, floors) {
    const source = floors?.length
      ? floors
      : (typeof window.directFloorCandidates === "function" ? window.directFloorCandidates(shapes || []) : []);
    const likelyFloors = source.filter(likelyFloorPlan);
    return likelyFloors.length ? likelyFloors : source;
  }

  const previousDwgAnalysis = window.directDwgAnalysis;
  window.directDwgAnalysis = function (status, message, shapes = [], floors = []) {
    const filteredFloors = floorCandidatesFrom(shapes, floors);
    const candidateCount = filteredFloors.length
      ? filteredFloors.reduce((sum, floor) => sum + (floor.shapes?.length || 0), 0)
      : shapes.length;
    const nextMessage = candidateCount
      ? `${message} ARQIS found ${candidateCount} converted CAD outline${candidateCount === 1 ? "" : "s"}, but it has kept them in review mode. Trace or accept a room before using it for costing.`
      : `${message} No usable room outlines were accepted from this CAD file.`;

    if (typeof window.showCadAnalysis === "function") {
      window.showCadAnalysis({
        status: "CAD converted - review needed",
        message: nextMessage,
        shapes: [],
        floors: [],
        manageRooms: false
      });
      return;
    }

    if (typeof previousDwgAnalysis === "function") {
      previousDwgAnalysis(status, nextMessage, shapes, filteredFloors);
    }
  };
}());
